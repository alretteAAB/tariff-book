// Copy one or more hospitals from one shard to another, verify row counts,
// and (only with --delete) remove them from the source shard.
//
//   cd scripts && npm install
//   node move-hospital.js --from 1 --to 2 --rs "RS Siloam Bogor" [--rs "..."] [--delete]
//
// --rs is rumah_sakit_ref.nama on the source shard (see `select shard_stats();`).
// Connection strings come from DATABASE_URL_<n> in scripts/.env (or the
// environment); never commit that file. Connect as postgres (direct or session
// pooler URL), so RLS does not apply.
//
// Safety:
// - The copy runs in ONE transaction on the target; it commits only if the
//   target ends up with exactly as many rows (per year) as the source.
// - Without --delete the source is never modified. Until the --delete run,
//   the hospital is on both shards and its rows appear twice in the app, so
//   finish with --delete soon (the copy step is skipped when the target
//   already holds identical counts).
// - Reference ids (kategori/kelas/layanan/rumah sakit) differ per shard, so
//   rows are re-linked by name. tarif_v2.id is kept.
// - Deleting rows does not shrink the database file: follow
//   sql/shard/runbook-reclaim-space.md afterwards.
import pg from 'pg';

try { process.loadEnvFile(new URL('.env', import.meta.url)); } catch { /* env may come from the shell */ }

const BATCH = 20000;

function parseArgs(argv) {
  const out = { rs: [], delete: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') out.from = argv[++i];
    else if (a === '--to') out.to = argv[++i];
    else if (a === '--rs') out.rs.push(argv[++i]);
    else if (a === '--delete') out.delete = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.from || !out.to || !out.rs.length) {
    throw new Error('Usage: node move-hospital.js --from 1 --to 2 --rs "Nama RS" [--rs ...] [--delete]');
  }
  if (out.from === out.to) throw new Error('--from and --to must differ');
  return out;
}

function connect(n) {
  const url = process.env[`DATABASE_URL_${n}`];
  if (!url) throw new Error(`DATABASE_URL_${n} is not set (scripts/.env)`);
  return new pg.Client({ connectionString: url });
}

// { tahun: count } for one hospital, plus the total
async function countByYear(db, rsNama) {
  const { rows } = await db.query(
    `select t.tahun, count(*)::int as n
       from tarif_v2 t join rumah_sakit_ref rs on rs.id = t.rumah_sakit_id
      where rs.nama = $1 group by t.tahun order by t.tahun`, [rsNama]);
  const byYear = Object.fromEntries(rows.map(r => [r.tahun ?? 'null', r.n]));
  return { byYear, total: rows.reduce((s, r) => s + r.n, 0) };
}

const sameCounts = (a, b) => JSON.stringify(a.byYear) === JSON.stringify(b.byYear);

// Insert names that are missing (without burning sequence values on
// conflicts: kategori/kelas ids are smallint) and return Map name -> id.
async function refIds(db, table, names) {
  const list = [...new Set(names.filter(n => n != null))];
  if (!list.length) return new Map();
  await db.query(
    `insert into ${table} (nama)
     select n from unnest($1::text[]) n
     where not exists (select 1 from ${table} r where r.nama = n)
     on conflict (nama) do nothing`, [list]);
  const { rows } = await db.query(`select id, nama from ${table} where nama = any($1::text[])`, [list]);
  return new Map(rows.map(r => [r.nama, r.id]));
}

async function copyHospital(src, dst, rsNama) {
  const { rows: [rs] } = await src.query('select id from rumah_sakit_ref where nama = $1', [rsNama]);
  if (!rs) throw new Error(`"${rsNama}" not found in rumah_sakit_ref on the source shard`);

  const before = await countByYear(src, rsNama);
  const existing = await countByYear(dst, rsNama);
  console.log(`  source rows: ${before.total}`, before.byYear);
  if (!before.total) {
    if (existing.total) console.log(`  already moved: target holds ${existing.total} rows, nothing to do`);
    else console.log('  no rows on the source shard, nothing to do');
    return null;
  }

  if (existing.total) {
    if (sameCounts(existing, before)) {
      console.log('  target already holds identical counts, copy skipped');
      return before;
    }
    throw new Error(`target already has ${existing.total} rows for "${rsNama}" with different counts; fix by hand`);
  }

  await dst.query('begin');
  try {
    // hospital + display info
    const { rows: [rsDst] } = await dst.query(
      `insert into rumah_sakit_ref (nama) values ($1)
       on conflict (nama) do update set nama = excluded.nama returning id`, [rsNama]);
    const { rows: info } = await src.query('select * from rumahsakit where rumah_sakit = $1', [rsNama]);
    for (const r of info) {
      await dst.query(
        `insert into rumahsakit (rumah_sakit, display_name, group_non_group, nama_group)
         values ($1, $2, $3, $4)
         on conflict (rumah_sakit) do update set display_name = excluded.display_name,
           group_non_group = excluded.group_non_group, nama_group = excluded.nama_group`,
        [r.rumah_sakit, r.display_name, r.group_non_group, r.nama_group]);
    }
    // room class mapping is global: keep every shard in sync with the source
    const { rows: rooms } = await src.query('select room_class, mapped_room_class from room_class_mapping');
    if (rooms.length) {
      await dst.query(
        `insert into room_class_mapping (room_class, mapped_room_class)
         select * from unnest($1::varchar[], $2::varchar[])
         on conflict (room_class) do update set mapped_room_class = excluded.mapped_room_class`,
        [rooms.map(r => r.room_class), rooms.map(r => r.mapped_room_class)]);
    }

    // tarif rows, in id order, re-linked by name
    let lastId = -1n;
    let copied = 0;
    for (;;) {
      const { rows } = await src.query(
        `select t.id, k.nama as kategori, kk.nama as kelas, l.nama as layanan,
                t.tahun, t.tarif, t.pct_increase
           from tarif_v2 t
           join kategori_ref k on k.id = t.kategori_id
           left join kelas_kamar_ref kk on kk.id = t.kelas_kamar_id
           join layanan_ref l on l.id = t.layanan_id
          where t.rumah_sakit_id = $1 and t.id > $2
          order by t.id limit ${BATCH}`, [rs.id, lastId.toString()]);
      if (!rows.length) break;
      lastId = BigInt(rows[rows.length - 1].id);

      const kat = await refIds(dst, 'kategori_ref', rows.map(r => r.kategori));
      const kelas = await refIds(dst, 'kelas_kamar_ref', rows.map(r => r.kelas));
      const lay = await refIds(dst, 'layanan_ref', rows.map(r => r.layanan));
      await dst.query(
        `insert into tarif_v2 (id, rumah_sakit_id, kategori_id, kelas_kamar_id, layanan_id, tahun, tarif, pct_increase)
         select * from unnest($1::bigint[], $2::smallint[], $3::smallint[], $4::smallint[],
                              $5::int[], $6::smallint[], $7::bigint[], $8::numeric[])`,
        [rows.map(r => r.id), rows.map(() => rsDst.id), rows.map(r => kat.get(r.kategori)),
         rows.map(r => (r.kelas == null ? null : kelas.get(r.kelas))), rows.map(r => lay.get(r.layanan)),
         rows.map(r => r.tahun), rows.map(r => r.tarif), rows.map(r => r.pct_increase)]);
      copied += rows.length;
      process.stdout.write(`  copied ${copied}/${before.total}\r`);
    }
    process.stdout.write('\n');

    const after = await countByYear(dst, rsNama);
    console.log(`  target rows: ${after.total}`, after.byYear);
    if (!sameCounts(after, before)) throw new Error('row counts differ after copy, rolled back');
    await dst.query('commit');
    console.log('  copy committed');
    return before;
  } catch (err) {
    await dst.query('rollback');
    throw err;
  }
}

async function deleteFromSource(src, dst, rsNama, expected) {
  const onTarget = await countByYear(dst, rsNama);
  if (!sameCounts(onTarget, expected)) throw new Error('target counts do not match the source; not deleting');
  await src.query('begin');
  try {
    const { rowCount } = await src.query(
      'delete from tarif_v2 where rumah_sakit_id = (select id from rumah_sakit_ref where nama = $1)', [rsNama]);
    if (rowCount !== expected.total) throw new Error(`would delete ${rowCount} rows, expected ${expected.total}; rolled back`);
    await src.query('commit');
    console.log(`  deleted ${rowCount} rows from the source shard`);
  } catch (err) {
    await src.query('rollback');
    throw err;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const src = connect(args.from);
  const dst = connect(args.to);
  await src.connect();
  await dst.connect();
  try {
    for (const rsNama of args.rs) {
      console.log(`\n${rsNama}: shard ${args.from} -> shard ${args.to}`);
      const counts = await copyHospital(src, dst, rsNama);
      if (counts && args.delete) await deleteFromSource(src, dst, rsNama, counts);
    }
    await dst.query('analyze tarif_v2');
    console.log('\nDone. The API picks up the new location within 5 minutes (filters cache).');
    if (!args.delete) {
      console.log('Source rows were kept, so these hospitals now show up twice in the app.');
      console.log('Re-run the same command with --delete to finish the move.');
    }
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch(err => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
