import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "JWT access token from /auth/login or /auth/register",
});

export function generateOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "TechLearn API",
      version: "1.0.0",
      description: "TechLearn educational platform backend API",
    },
    servers: [{ url: "/api/v1", description: "API v1" }],
    tags: [
      { name: "Auth", description: "Authentication and session management" },
      { name: "Curriculums", description: "Curriculum CRUD operations" },
      { name: "Grades", description: "Grade CRUD operations" },
      { name: "Subjects", description: "Subject CRUD operations" },
      { name: "Chapters", description: "Chapter CRUD operations" },
      { name: "Upload", description: "File upload" },
      { name: "Email", description: "Email queue administration" },
    ],
  });
}
