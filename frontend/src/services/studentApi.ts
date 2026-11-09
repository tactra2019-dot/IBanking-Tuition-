import { client } from "./client";
import type { Student } from "../types";
export const studentApi = {
  lookup: async (id: string) =>
    (await client.get<Student>(`/students/${encodeURIComponent(id)}/tuition`))
      .data,
};
