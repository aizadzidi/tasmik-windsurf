import { describe, expect, it } from "vitest";
import { filterTeachersByTeachingScope } from "@/lib/adminTeacherScope";

const createClient = (
  rows: Array<{ teacher_id?: string | null; programs?: { type?: "campus" | "online" | "hybrid" | null } | null }>
) => ({
  from: () => ({
    select: () => {
      let scopedRows = rows;
      const query = {
        eq: (_column: string, value: unknown) => {
          if (_column === "tenant_id") {
            scopedRows = scopedRows.filter(() => value === "tenant-1");
          }
          return query;
        },
        in: async () => ({ data: scopedRows, error: null }),
      };
      return query;
    },
  }),
});

describe("filterTeachersByTeachingScope", () => {
  it("keeps only online-scoped teachers for online lists", async () => {
    const teachers = [
      { id: "campus-1", name: "Campus Teacher" },
      { id: "online-1", name: "Online Teacher" },
      { id: "both-1", name: "Both Teacher" },
    ];

    const filtered = await filterTeachersByTeachingScope(
      createClient([
        { teacher_id: "campus-1", programs: { type: "campus" } },
        { teacher_id: "online-1", programs: { type: "online" } },
        { teacher_id: "both-1", programs: { type: "online" } },
        { teacher_id: "both-1", programs: { type: "campus" } },
      ]),
      teachers,
      "online",
      "tenant-1"
    );

    expect(filtered.map((teacher) => teacher.id)).toEqual(["online-1", "both-1"]);
  });

  it("keeps only campus-scoped teachers for campus lists", async () => {
    const teachers = [
      { id: "campus-1", name: "Campus Teacher" },
      { id: "online-1", name: "Online Teacher" },
      { id: "hybrid-1", name: "Hybrid Teacher" },
    ];

    const filtered = await filterTeachersByTeachingScope(
      createClient([
        { teacher_id: "campus-1", programs: { type: "campus" } },
        { teacher_id: "online-1", programs: { type: "online" } },
        { teacher_id: "hybrid-1", programs: { type: "hybrid" } },
      ]),
      teachers,
      "campus",
      "tenant-1"
    );

    expect(filtered.map((teacher) => teacher.id)).toEqual(["campus-1", "hybrid-1"]);
  });

  it("falls back to the original list when assignment rows are unavailable", async () => {
    const teachers = [
      { id: "teacher-1", name: "Teacher 1" },
      { id: "teacher-2", name: "Teacher 2" },
    ];

    const filtered = await filterTeachersByTeachingScope(
      createClient([]),
      teachers,
      "online",
      "tenant-1"
    );

    expect(filtered).toEqual(teachers);
  });
});
