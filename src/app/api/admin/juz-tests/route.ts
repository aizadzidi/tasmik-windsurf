import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

export async function POST(request: NextRequest) {
  try {
    const testData = await request.json();
    
    // Validate required fields
    if (!testData.student_id || !testData.juz_number) {
      return NextResponse.json(
        { error: "Missing required fields: student_id and juz_number" },
        { status: 400 }
      );
    }

    // Insert the juz test record using service-role client (bypasses RLS)
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("juz_tests")
        .insert([testData])
        .select();
      if (error) {
        // Bubble up clearer messages for common constraints
        if ((error as any)?.code === '23505') {
          // unique_violation
          throw new Error('A passed juz test already exists for this student and juz. You can only have one PASSED record per juz.');
        }
        throw error;
      }
      return data;
    });

    return NextResponse.json(data[0], { status: 201 });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: (error as any)?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("student_id");

    if (!studentId) {
      return NextResponse.json(
        { error: "Missing student_id parameter" },
        { status: 400 }
      );
    }

    // Fetch juz tests for the student using service-role client
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("juz_tests")
        .select("*")
        .eq("student_id", studentId)
        .order("test_date", { ascending: false });
      if (error) throw error;
      return data;
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: (error as any)?.message || "Internal server error" },
      { status: 500 }
    );
  }
}