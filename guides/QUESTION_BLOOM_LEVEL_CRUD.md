# CRUD Guide: QuestionBloomLevel

A complete step-by-step guide to add full CRUD for `QuestionBloomLevel`.

> The DB table `question_bloom_levels` already exists. Prisma model already added and `prisma generate` already ran.
> Start from Step 1.

---

## What you will build

| Layer | Files to create/edit |
|---|---|
| Backend | `schemas.ts`, `service.ts`, `routes.ts`, `roles.ts`, `app.ts` |
| Frontend | `question-bloom-level.api.ts`, `query-keys.ts`, `validation.ts`, `page.tsx`, `QuestionBloomLevelForm.tsx`, `sidebar.config.ts` |

---

## PART 1 — Backend

### Step 1 — Add permission

In `src/config/roles.ts`, add one line inside `PERMISSIONS`:

```typescript
"question-bloom-level:write": [ROLES.admin],
```

Result:

```typescript
export const PERMISSIONS = {
  "curriculum:write": [ROLES.admin],
  "grade:write": [ROLES.admin],
  "subject:write": [ROLES.admin],
  "chapter:write": [ROLES.admin],
  "email:admin": [ROLES.admin],
  "question-bloom-level:write": [ROLES.admin],  // ← add this
} as const;
```

---

### Step 2 — Create schemas

Create `src/modules/question-bloom-levels/schemas.ts`:

```typescript
import xss from "xss";
import { z } from "zod";
import { paginationQuery } from "../../schemas/shared.js";

const sanitize = (val: string) => xss(val, { whiteList: {}, stripIgnoreTag: true });

export const createQuestionBloomLevelBody = z.object({
  name: z.string().trim().min(1, "Name is required").transform(sanitize),
  description: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  color: z.string().trim().min(1, "Color is required"),
  sortOrder: z.number().int().optional(),
});

export const updateQuestionBloomLevelBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  description: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? sanitize(val) : val)),
  color: z.string().trim().min(1, "Color cannot be empty").optional(),
  sortOrder: z.number().int().optional(),
});

export const listQuestionBloomLevelsQuery = paginationQuery;
```

---

### Step 3 — Create service

Create `src/modules/question-bloom-levels/service.ts`:

```typescript
import { Prisma } from "../../../generated/prisma/index.js";

import { prisma } from "../../database/prisma.js";
import { invalidateCache } from "../../utils/cache.js";
import { createBaseService } from "../../utils/crudService.js";
import { AppError } from "../../utils/errors.js";

type CreateInput = {
  name: string;
  description?: string;
  color: string;
  sortOrder?: number;
};

type UpdateInput = {
  name?: string;
  description?: string;
  color?: string;
  sortOrder?: number;
};

type ListInput = { page: number; limit: number; search?: string };

const base = createBaseService<CreateInput, UpdateInput, ListInput>({
  model: prisma.questionBloomLevel,
  cachePrefix: "question-bloom-levels",
  entityName: "QuestionBloomLevel",
  buildWhere: ({ search }) => ({
    isDeleted: false,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  }),
});

async function create(data: CreateInput) {
  try {
    const level = await prisma.questionBloomLevel.create({
      data: {
        name: data.name,
        description: data.description || null,
        color: data.color,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await invalidateCache("question-bloom-levels:*");
    return level;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Name or color already exists");
    }
    throw err;
  }
}

async function update(id: bigint, data: UpdateInput) {
  try {
    const existing = await prisma.questionBloomLevel.findFirst({
      where: { id, isDeleted: false },
    });
    if (!existing) throw new AppError(404, "QuestionBloomLevel not found");

    const updated = await prisma.questionBloomLevel.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });

    await invalidateCache("question-bloom-levels:*");
    return updated;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Name or color already exists");
    }
    throw err;
  }
}

export const questionBloomLevelService = { ...base, create, update };
```

---

### Step 4 — Create routes

Create `src/modules/question-bloom-levels/routes.ts`:

```typescript
import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requirePermission } from "../../middlewares/requirePermission.js";
import { userLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validate.js";
import { idParam } from "../../schemas/shared.js";
import {
  createQuestionBloomLevelBody,
  listQuestionBloomLevelsQuery,
  updateQuestionBloomLevelBody,
} from "./schemas.js";
import { questionBloomLevelService } from "./service.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/question-bloom-levels",
  requirePermission("question-bloom-level:write"),
  validate({ body: createQuestionBloomLevelBody }),
  async (req, res, next) => {
    try {
      const { name, description, color, sortOrder } = req.body as z.infer<
        typeof createQuestionBloomLevelBody
      >;
      const level = await questionBloomLevelService.create({ name, description, color, sortOrder });
      return res.status(201).json({ message: "QuestionBloomLevel created", data: level });
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/question-bloom-levels",
  userLimiter(60, 60_000),
  validate({ query: listQuestionBloomLevelsQuery }),
  async (req, res, next) => {
    try {
      const { page, limit, search } = res.locals.query as z.infer<
        typeof listQuestionBloomLevelsQuery
      >;
      const result = await questionBloomLevelService.list({ page, limit, search });
      return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
    } catch (err) {
      return next(err);
    }
  }
);

router.get(
  "/question-bloom-levels/:id",
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const result = await questionBloomLevelService.getById(BigInt(req.params.id as string));
      return res.set("X-Cache", result.cached ? "HIT" : "MISS").json(result.data);
    } catch (err) {
      return next(err);
    }
  }
);

router.put(
  "/question-bloom-levels/:id",
  requirePermission("question-bloom-level:write"),
  validate({ params: idParam, body: updateQuestionBloomLevelBody }),
  async (req, res, next) => {
    try {
      const { name, description, color, sortOrder } = req.body as z.infer<
        typeof updateQuestionBloomLevelBody
      >;
      const updated = await questionBloomLevelService.update(BigInt(req.params.id as string), {
        name,
        description,
        color,
        sortOrder,
      });
      return res.json({ message: "QuestionBloomLevel updated", data: updated });
    } catch (err) {
      return next(err);
    }
  }
);

router.delete(
  "/question-bloom-levels/:id",
  requirePermission("question-bloom-level:write"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      await questionBloomLevelService.softDelete(BigInt(req.params.id as string));
      return res.json({ message: "QuestionBloomLevel deleted" });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
```

---

### Step 5 — Register in app.ts

In `src/app.ts`, add two lines:

```typescript
// With the other imports at the top:
import questionBloomLevelRoutes from "./modules/question-bloom-levels/routes.js";

// With the other app.use() calls:
app.use("/api/v1", questionBloomLevelRoutes);
```

---

### Step 6 — Test backend with curl

```bash
# Replace <token> with your access token from login

# Create
curl -X POST http://localhost:4000/api/v1/question-bloom-levels \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YWRlNTY2Zi01YjNiLTQ2MmMtOWNhNi0xNTY3NmU1Mzk0MTkiLCJwcm9maWxlSWQiOiJlOGIyNDhjZC0zNGQ3LTQxMmMtYTJkOS0yMTkxNDQ5YWVkNmUiLCJ1c2VyVHlwZSI6ImFkbWluIiwiaWF0IjoxNzczMDQwNDAwLCJleHAiOjE3NzMwNDIyMDB9.-F1JXUDAFCblPnESMEIR7ZtZe2PNOqaC-iHawmC8yYQ" \
  -H "Content-Type: application/json" \
  -d '{"name":"Remember","description":"Recall facts and basic concepts","color":"#4CAF50","sortOrder":1}'

# List
curl "http://localhost:4000/api/v1/question-bloom-levels?page=1&limit=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YWRlNTY2Zi01YjNiLTQ2MmMtOWNhNi0xNTY3NmU1Mzk0MTkiLCJwcm9maWxlSWQiOiJlOGIyNDhjZC0zNGQ3LTQxMmMtYTJkOS0yMTkxNDQ5YWVkNmUiLCJ1c2VyVHlwZSI6ImFkbWluIiwiaWF0IjoxNzczMDQwNDAwLCJleHAiOjE3NzMwNDIyMDB9.-F1JXUDAFCblPnESMEIR7ZtZe2PNOqaC-iHawmC8yYQ"

# Get by ID
curl http://localhost:4000/api/v1/question-bloom-levels/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YWRlNTY2Zi01YjNiLTQ2MmMtOWNhNi0xNTY3NmU1Mzk0MTkiLCJwcm9maWxlSWQiOiJlOGIyNDhjZC0zNGQ3LTQxMmMtYTJkOS0yMTkxNDQ5YWVkNmUiLCJ1c2VyVHlwZSI6ImFkbWluIiwiaWF0IjoxNzczMDQwNDAwLCJleHAiOjE3NzMwNDIyMDB9.-F1JXUDAFCblPnESMEIR7ZtZe2PNOqaC-iHawmC8yYQ"

# Update
curl -X PUT http://localhost:4000/api/v1/question-bloom-levels/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YWRlNTY2Zi01YjNiLTQ2MmMtOWNhNi0xNTY3NmU1Mzk0MTkiLCJwcm9maWxlSWQiOiJlOGIyNDhjZC0zNGQ3LTQxMmMtYTJkOS0yMTkxNDQ5YWVkNmUiLCJ1c2VyVHlwZSI6ImFkbWluIiwiaWF0IjoxNzczMDQwNDAwLCJleHAiOjE3NzMwNDIyMDB9.-F1JXUDAFCblPnESMEIR7ZtZe2PNOqaC-iHawmC8yYQ" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated description"}'

# Delete
curl -X DELETE http://localhost:4000/api/v1/question-bloom-levels/1 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0YWRlNTY2Zi01YjNiLTQ2MmMtOWNhNi0xNTY3NmU1Mzk0MTkiLCJwcm9maWxlSWQiOiJlOGIyNDhjZC0zNGQ3LTQxMmMtYTJkOS0yMTkxNDQ5YWVkNmUiLCJ1c2VyVHlwZSI6ImFkbWluIiwiaWF0IjoxNzczMDQwNDAwLCJleHAiOjE3NzMwNDIyMDB9.-F1JXUDAFCblPnESMEIR7ZtZe2PNOqaC-iHawmC8yYQ"
```

---

## PART 2 — Frontend (techlearn-admin)

### Step 7 — API layer

Create `src/lib/api/question-bloom-level.api.ts`:

```typescript
import { apiRequest } from "./client";
import { buildQuery } from "./buildQuery";
import type { PaginatedResponse } from "./types";

export type QuestionBloomLevel = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: string; // BigInt serialised as string
  isDeleted: boolean;
  createdAt: string;
};

export type QuestionBloomLevelListParams = {
  page?: number;
  limit?: number;
  search?: string;
};

export type QuestionBloomLevelBody = {
  name: string;
  description?: string;
  color: string;
  sortOrder?: number;
};

export async function getQuestionBloomLevels(
  params: QuestionBloomLevelListParams = {},
): Promise<PaginatedResponse<QuestionBloomLevel>> {
  return apiRequest<PaginatedResponse<QuestionBloomLevel>>(
    `/question-bloom-levels${buildQuery(params)}`,
  );
}

export async function getQuestionBloomLevel(
  id: string,
): Promise<{ data: QuestionBloomLevel }> {
  return apiRequest<{ data: QuestionBloomLevel }>(`/question-bloom-levels/${id}`);
}

export async function createQuestionBloomLevel(
  body: QuestionBloomLevelBody,
): Promise<{ message: string; data: QuestionBloomLevel }> {
  return apiRequest<{ message: string; data: QuestionBloomLevel }>("/question-bloom-levels", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateQuestionBloomLevel(
  id: string,
  body: Partial<QuestionBloomLevelBody>,
): Promise<{ message: string; data: QuestionBloomLevel }> {
  return apiRequest<{ message: string; data: QuestionBloomLevel }>(
    `/question-bloom-levels/${id}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

export async function deleteQuestionBloomLevel(
  id: string,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/question-bloom-levels/${id}`, {
    method: "DELETE",
  });
}
```

---

### Step 8 — Add query keys

In `src/lib/query-keys.ts`, add inside the `queryKeys` object:

```typescript
questionBloomLevels: {
  all: () => ["question-bloom-levels"] as const,
  list: (params: { page: number; search: string }) =>
    ["question-bloom-levels", "list", params] as const,
},
```

---

### Step 9 — Add Zod validation

In `src/lib/validation.ts`, add:

```typescript
export const questionBloomLevelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  color: z.string().min(1, "Color is required"),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export type QuestionBloomLevelFormValues = z.infer<typeof questionBloomLevelSchema>;
```

---

### Step 10 — Create the form

Create `src/app/(protected)/question-bloom-levels/QuestionBloomLevelForm.tsx`:

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SheetFooter } from "@/components/ui/sheet";
import LoadingButton from "@/components/LoadingButton";
import { questionBloomLevelSchema, QuestionBloomLevelFormValues } from "@/lib/validation";
import {
  createQuestionBloomLevel,
  updateQuestionBloomLevel,
  type QuestionBloomLevel,
} from "@/lib/api/question-bloom-level.api";
import { queryKeys } from "@/lib/query-keys";
import { useCrudMutation } from "@/hooks/useCrudMutation";

interface QuestionBloomLevelFormProps {
  level?: QuestionBloomLevel;
  onClose: () => void;
}

export default function QuestionBloomLevelForm({ level, onClose }: QuestionBloomLevelFormProps) {
  const isEditing = !!level;

  const form = useForm<QuestionBloomLevelFormValues>({
    resolver: zodResolver(questionBloomLevelSchema),
    defaultValues: {
      name: level?.name ?? "",
      description: level?.description ?? "",
      color: level?.color ?? "",
      sortOrder: level?.sortOrder ? Number(level.sortOrder) : 0,
    },
  });

  const { mutate, isPending } = useCrudMutation({
    mutationFn: async (values: QuestionBloomLevelFormValues) => {
      if (isEditing) {
        return updateQuestionBloomLevel(level.id, {
          name: values.name,
          description: values.description || undefined,
          color: values.color,
          sortOrder: values.sortOrder,
        });
      }
      return createQuestionBloomLevel({
        name: values.name,
        description: values.description || undefined,
        color: values.color,
        sortOrder: values.sortOrder,
      });
    },
    invalidateKeys: [queryKeys.questionBloomLevels.all()],
    successMessage: isEditing ? "Level updated." : "Level created.",
    onSuccess: () => {
      if (!isEditing) form.reset();
      onClose();
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutate(values))}
        className="flex flex-col flex-1 overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Remember" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-md border border-input cursor-pointer p-1"
                      {...field}
                    />
                    <Input placeholder="#4CAF50" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sortOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Sort Order{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input type="number" min={0} placeholder="0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Description{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <textarea
                    placeholder="Brief description of this Bloom level..."
                    rows={4}
                    className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <SheetFooter className="px-4 py-4 border-t">
          <LoadingButton loading={isPending} type="submit" className="w-full">
            {isEditing ? "Save Changes" : "Create Level"}
          </LoadingButton>
        </SheetFooter>
      </form>
    </Form>
  );
}
```

---

### Step 11 — Create the page

Create `src/app/(protected)/question-bloom-levels/page.tsx`:

```tsx
"use client";

import { Suspense, useState, useMemo } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { DataListPage, type Column } from "@/components/DataListPage";
import { useListPage } from "@/hooks/useListPage";
import { useCrudMutation } from "@/hooks/useCrudMutation";
import {
  getQuestionBloomLevels,
  deleteQuestionBloomLevel,
  type QuestionBloomLevel,
} from "@/lib/api/question-bloom-level.api";
import { queryKeys } from "@/lib/query-keys";
import QuestionBloomLevelForm from "./QuestionBloomLevelForm";

function QuestionBloomLevelsContent() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<QuestionBloomLevel | null>(null);
  const [deletingLevel, setDeletingLevel] = useState<QuestionBloomLevel | null>(null);

  const list = useListPage<QuestionBloomLevel>({
    queryKey: (params) =>
      queryKeys.questionBloomLevels.list({ page: params.page, search: params.search }),
    queryFn: getQuestionBloomLevels,
  });

  const { mutate: confirmDelete, isPending: isDeleting } = useCrudMutation({
    mutationFn: (id: string) => deleteQuestionBloomLevel(id),
    invalidateKeys: [queryKeys.questionBloomLevels.all()],
    successMessage: "Level deleted.",
    onSuccess: () => setDeletingLevel(null),
  });

  const columns: Column<QuestionBloomLevel>[] = useMemo(() => [
    {
      header: "Color",
      skeleton: "h-6 w-6 rounded-full",
      cell: (l) => (
        <div
          className="h-6 w-6 rounded-full border border-border"
          style={{ backgroundColor: l.color }}
          title={l.color}
        />
      ),
    },
    {
      header: "Name",
      skeleton: "h-4 w-32",
      cell: (l) => <span className="font-medium">{l.name}</span>,
    },
    {
      header: "Description",
      skeleton: "h-4 w-48",
      cell: (l) => (
        <span className="text-muted-foreground max-w-xs truncate block">{l.description ?? "—"}</span>
      ),
    },
    {
      header: "Sort",
      skeleton: "h-4 w-8",
      cell: (l) => <span className="text-muted-foreground">{l.sortOrder}</span>,
    },
    {
      header: "Actions",
      skeleton: "h-4 w-20",
      cell: (l) => (
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => setEditingLevel(l)}>
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeletingLevel(l)}
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ], []);

  return (
    <>
      <DataListPage
        title="Question Bloom Levels"
        searchPlaceholder="Search levels..."
        columns={columns}
        getRowKey={(l) => l.id}
        emptyMessage="No Bloom levels found."
        addButton={
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus /> Add New
          </Button>
        }
        {...list}
      />

      {/* Add New Drawer */}
      <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Add New Level</SheetTitle>
            <SheetDescription>Create a new Bloom taxonomy level.</SheetDescription>
          </SheetHeader>
          <QuestionBloomLevelForm onClose={() => setIsAddOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Edit Drawer */}
      <Sheet
        open={!!editingLevel}
        onOpenChange={(open) => { if (!open) setEditingLevel(null); }}
      >
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Edit Level</SheetTitle>
            <SheetDescription>Update the Bloom level details.</SheetDescription>
          </SheetHeader>
          {editingLevel && (
            <QuestionBloomLevelForm level={editingLevel} onClose={() => setEditingLevel(null)} />
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={!!deletingLevel}
        onOpenChange={(open) => { if (!open) setDeletingLevel(null); }}
        entityName="Level"
        entityLabel={deletingLevel?.name ?? ""}
        onConfirm={() => deletingLevel && confirmDelete(deletingLevel.id)}
        isPending={isDeleting}
      />
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <QuestionBloomLevelsContent />
    </Suspense>
  );
}
```

---

### Step 12 — Add to sidebar

In `src/configs/sidebar.config.ts`, add an entry to the appropriate group (e.g. "Test Management"):

```typescript
{
  title: "Bloom Levels",
  url: "/question-bloom-levels",
  icon: "Layers",  // pick any lucide icon that fits
},
```

---

## Checklist

### Backend
- [ ] Permission added in `src/config/roles.ts`
- [ ] `src/modules/question-bloom-levels/schemas.ts` created
- [ ] `src/modules/question-bloom-levels/service.ts` created
- [ ] `src/modules/question-bloom-levels/routes.ts` created
- [ ] Route imported and registered in `src/app.ts`
- [ ] Backend tested with curl (create, list, update, delete)

### Frontend
- [ ] `src/lib/api/question-bloom-level.api.ts` created
- [ ] Query keys added in `src/lib/query-keys.ts`
- [ ] Zod schema added in `src/lib/validation.ts`
- [ ] `QuestionBloomLevelForm.tsx` created
- [ ] `page.tsx` created
- [ ] Sidebar entry added in `src/configs/sidebar.config.ts`
