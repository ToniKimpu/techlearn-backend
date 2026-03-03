# Grade CRUD — Frontend Implementation Guide

> Next.js (App Router) · TypeScript · Axios

---

## Folder Structure

```
src/
├── lib/
│   └── api.ts                  # axios instance (shared)
├── features/grades/
│   ├── types.ts                # Grade types
│   └── api.ts                  # all Grade API calls
```

---

## Types

```ts
// features/grades/types.ts

export interface Grade {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  curriculumId: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  gradeId: string;
}

// Admin list — includes curriculum name + subject count
export interface GradeWithCount extends Grade {
  subjectCount: number;
  curriculum: { name: string };
}

// Mobile list — includes curriculum name + full subjects array
export interface GradeWithSubjects extends Grade {
  subjects: Subject[];
  curriculum: { name: string };
}

export interface GradeListResponse<T = GradeWithCount> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface GradeListParams {
  page?: number;
  limit?: number;
  search?: string;
  curriculumId?: string | number;
}
```

---

## Axios Instance

```ts
// lib/api.ts

import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + "/api/v1",
  withCredentials: true, // sends refresh-token cookie
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
```

---

## API Functions

```ts
// features/grades/api.ts

import api from "@/lib/api";
import type {
  Grade,
  GradeWithCount,
  GradeWithSubjects,
  GradeListResponse,
  GradeListParams,
} from "./types";

// Admin panel — subjectCount + curriculum name
export async function listGrades(
  params: GradeListParams = {}
): Promise<GradeListResponse<GradeWithCount>> {
  const { data } = await api.get("/grades", { params });
  return data;
}

// Mobile — full subjects[] + curriculum name
export async function listGradesWithSubjects(
  params: GradeListParams = {}
): Promise<GradeListResponse<GradeWithSubjects>> {
  const { data } = await api.get("/grades", { params: { ...params, include: "subjects" } });
  return data;
}

export async function getGrade(id: string): Promise<Grade> {
  const { data } = await api.get(`/grades/${id}`);
  return data.data;
}

export interface CreateGradeInput {
  name: string;
  description?: string;
  image?: string;
  curriculumId: string | number;
}

export async function createGrade(input: CreateGradeInput): Promise<Grade> {
  const { data } = await api.post("/grades", input);
  return data.data;
}

export type UpdateGradeInput = Partial<CreateGradeInput>;

export async function updateGrade(id: string, input: UpdateGradeInput): Promise<Grade> {
  const { data } = await api.put(`/grades/${id}`, input);
  return data.data;
}

export async function deleteGrade(id: string): Promise<void> {
  await api.delete(`/grades/${id}`);
}
```

---

## Error Handling

The backend returns errors in this shape:

```json
{ "message": "Grade not found" }
```

```ts
// lib/handleApiError.ts

import { AxiosError } from "axios";

export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof AxiosError) {
    return err.response?.data?.message ?? fallback;
  }
  return fallback;
}
```

**Common status codes:**

| Code | Meaning |
|------|---------|
| `400` | Validation error |
| `401` | Not authenticated — redirect to login |
| `403` | Missing `grade:write` permission |
| `404` | Grade or Curriculum not found |
| `429` | Rate limited — back off and retry |

---

## Usage Examples

### Server Component — Admin list

```tsx
// app/admin/grades/page.tsx

import { listGrades } from "@/features/grades/api";

export default async function GradesPage() {
  const { data: grades, pagination } = await listGrades({ limit: 20 });

  return (
    <ul>
      {grades.map((g) => (
        <li key={g.id}>
          {g.name} · {g.curriculum.name} · {g.subjectCount} subjects
        </li>
      ))}
    </ul>
  );
}
```

### Client Component — Mobile subject picker

```tsx
// components/SubjectPicker.tsx
"use client";

import { useEffect, useState } from "react";
import { listGradesWithSubjects } from "@/features/grades/api";
import type { GradeWithSubjects } from "@/features/grades/types";

export function SubjectPicker({ curriculumId }: { curriculumId: string }) {
  const [grades, setGrades] = useState<GradeWithSubjects[]>([]);

  useEffect(() => {
    listGradesWithSubjects({ curriculumId, limit: 100 }).then((res) => setGrades(res.data));
  }, [curriculumId]);

  return (
    <>
      {grades.map((grade) => (
        <section key={grade.id}>
          <h3>{grade.name}</h3>
          {grade.subjects.map((s) => (
            <button key={s.id}>{s.name}</button>
          ))}
        </section>
      ))}
    </>
  );
}
```

### Mutation — Create grade

```tsx
"use client";

import { useState } from "react";
import { createGrade } from "@/features/grades/api";
import { getErrorMessage } from "@/lib/handleApiError";

export function CreateGradeForm({ curriculumId }: { curriculumId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createGrade({ name, curriculumId });
      setName("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grade name" />
      {error && <p className="text-red-500">{error}</p>}
      <button type="submit">Create</button>
    </form>
  );
}
```

---

## Quick Reference

| Action | Function | Permission |
|--------|----------|------------|
| List (admin) | `listGrades(params)` | authenticated |
| List (mobile) | `listGradesWithSubjects(params)` | authenticated |
| Get one | `getGrade(id)` | authenticated |
| Create | `createGrade(input)` | `grade:write` |
| Update | `updateGrade(id, input)` | `grade:write` |
| Delete | `deleteGrade(id)` | `grade:write` |

> **Note:** IDs are BigInt-backed on the server but serialised as strings in JSON.
> Always treat `id`, `curriculumId`, `gradeId` as `string` on the frontend.
