import { getCache, invalidateCache, setCache } from "./cache.js";
import { AppError } from "./errors.js";

type PrismaModel = {
  findFirst: (args: any) => Promise<any>;
  findMany: (args: any) => Promise<any>;
  count: (args: any) => Promise<number>;
  create: (args: any) => Promise<any>;
  update: (args: any) => Promise<any>;
};

export interface BaseServiceOptions<
  TListInput extends { page: number; limit: number; search?: string },
> {
  /** Prisma delegate, e.g. prisma.curriculum */
  model: PrismaModel;

  /** Cache key prefix, e.g. "curriculums" → keys like "curriculums:list:..." */
  cachePrefix: string;

  /** Human-readable entity name for 404 messages, e.g. "Curriculum" */
  entityName: string;

  /** Build the Prisma `where` object from list params */
  buildWhere: (params: TListInput) => Record<string, unknown>;

  /** Default orderBy for list queries (default: { createdAt: "desc" }) */
  orderBy?: Record<string, string>;

  /** Build a unique cache key suffix from list params (beyond page/limit/search) */
  listCacheKey?: (params: TListInput) => string;

  /** Prisma `include` or `select` to pass to findMany */
  listInclude?: (params: TListInput) => Record<string, unknown> | undefined;

  /** Transform each item before returning in list (e.g. flatten _count) */
  transformItem?: (item: any, params: TListInput) => any;

  /** Cache TTL in seconds for list queries (default: 300) */
  listTtl?: number;

  /** Cache TTL in seconds for detail queries (default: 600) */
  detailTtl?: number;
}

export function createBaseService<
  TListInput extends { page: number; limit: number; search?: string },
>(opts: BaseServiceOptions<TListInput>) {
  const listTtl = opts.listTtl ?? 300;
  const detailTtl = opts.detailTtl ?? 600;
  const orderBy = opts.orderBy ?? { createdAt: "desc" };

  async function list(params: TListInput) {
    const extra = opts.listCacheKey?.(params) ?? "";
    const cacheKey = `${opts.cachePrefix}:list${params.page}:${params.limit}:${params.search || "all"}${extra}`;

    const { data: cached } = await getCache(cacheKey);
    if (cached) return { cached: true, data: cached };

    const where = opts.buildWhere(params);
    const include = opts.listInclude?.(params);

    const [items, total] = await Promise.all([
      opts.model.findMany({
        where,
        orderBy,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        ...(include ? { include } : {}),
      }),
      opts.model.count({ where }),
    ]);

    const data = opts.transformItem
      ? items.map((item: any) => opts.transformItem!(item, params))
      : items;

    const response = {
      data,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
    await setCache(cacheKey, response, listTtl);
    return { cached: false, data: response };
  }

  async function getById(id: bigint) {
    const cacheKey = `${opts.cachePrefix}:detail:${id}`;
    const { data: cached } = await getCache(cacheKey);
    if (cached) return { cached: true, data: cached };

    const item = await opts.model.findFirst({ where: { id, isDeleted: false } });
    if (!item) throw new AppError(404, `${opts.entityName} not found`);
    const response = { data: item };
    await setCache(cacheKey, response, detailTtl);
    return { cached: false, data: response };
  }

  async function softDelete(id: bigint) {
    const existing = await opts.model.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new AppError(404, `${opts.entityName} not found`);

    await opts.model.update({ where: { id }, data: { isDeleted: true } });
    await invalidateCache(`${opts.cachePrefix}:*`);
  }
  return { list, getById, softDelete };
}
