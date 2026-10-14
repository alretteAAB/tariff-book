import { parseMulti, json } from './_supabase.js';
import { pickShards, callShards, partialInfo } from './_shards.js';
import { mergeSorted } from './_merge.js';

const PAGE_SIZE = 50;
// Across several shards, page N needs the top N*50 rows from every shard, so
// deep pages get expensive. The UI is offered at most this many pages there.
const MULTI_SHARD_MAX_PAGE = 100;

const stripCount = (rows) => rows.map(({ total_count, ...r }) => r);

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') || '').trim() || null;
  const f_kategori    = parseMulti(p, 'kategori');
  const f_rumah_sakit = parseMulti(p, 'rumah_sakit');
  const f_tahun       = parseMulti(p, 'tahun')?.map(Number) ?? null;
  const f_kelas       = parseMulti(p, 'kelas_kamar');
  const sort = p.get('sort') || null;
  const page = Math.max(1, parseInt(p.get('page')) || 1);

  const hasAny = Boolean(q) || f_kategori || f_rumah_sakit || f_tahun || f_kelas;
  if (!hasAny) return json({ data: [], total: 0, page: 1, totalPages: 0 });

  const filters = { q, f_kategori, f_rumah_sakit, f_tahun, f_kelas, sort };
  const shards = await pickShards(env, f_rumah_sakit);

  if (shards.length === 1) {
    const { ok, failed } = await callShards(shards, 'search_tarif', { ...filters, page, page_size: PAGE_SIZE });
    if (failed.length) return json({ error: failed[0].error }, 500);
    const data = ok[0].data;
    const total = data.length ? Number(data[0].total_count) : 0;
    return json({ data: stripCount(data), total, page, totalPages: Math.ceil(total / PAGE_SIZE) });
  }

  if (page > MULTI_SHARD_MAX_PAGE) {
    return json({
      data: [], total: 0, page, totalPages: MULTI_SHARD_MAX_PAGE,
      error: `Maksimal ${MULTI_SHARD_MAX_PAGE} halaman. Persempit filter, misalnya pilih rumah sakit.`,
    });
  }

  const { ok, failed } = await callShards(shards, 'search_tarif', {
    ...filters, page: 1, page_size: page * PAGE_SIZE,
  });
  if (!ok.length) return json({ error: failed[0].error }, 500);

  const total = ok.reduce((sum, r) => sum + (r.data.length ? Number(r.data[0].total_count) : 0), 0);
  const rows = mergeSorted(ok.map(r => r.data), sort, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  return json({
    data: stripCount(rows),
    total,
    page,
    totalPages: Math.min(Math.ceil(total / PAGE_SIZE), MULTI_SHARD_MAX_PAGE),
    ...partialInfo(failed),
  });
}
