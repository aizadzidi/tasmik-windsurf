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
    const insertedRecord = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("juz_tests")
        .insert([testData])
        .select();
      if (error) {
        throw error;
      }
      
      let record = data?.[0];

      // Some legacy DB defaults/triggers still overwrite certain fields on insert.
      // Immediately re-apply the values we just collected so the final record
      // always reflects the form submission without requiring a manual edit.
      if (record?.id) {
        const fieldsToPreserve = [
          "section2_scores",
          "tajweed_score",
          "recitation_score",
          "total_percentage",
          "passed",
          "should_repeat",
          "remarks",
          "examiner_name",
        ] as const;

        const updatePayload = fieldsToPreserve.reduce((acc, field) => {
          if (testData[field] !== undefined) {
            acc[field] = testData[field];
          }
          return acc;
        }, {} as Record<string, any>);

        if (record && Object.keys(updatePayload).length > 0) {
          const { data: enforcedData, error: enforceError } = await client
            .from("juz_tests")
            .update(updatePayload)
            .eq("id", record.id)
            .select();
          
          if (!enforceError && enforcedData?.[0]) {
            record = enforcedData[0];
          } else if (enforceError) {
            console.warn("Failed to re-apply juz test scores after insert:", enforceError);
          }
        }
      }

      return record;
    });

    return NextResponse.json(insertedRecord, { status: 201 });
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

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("id");
    const updateData = await request.json();

    if (!testId) {
      return NextResponse.json(
        { error: "Missing test ID parameter" },
        { status: 400 }
      );
    }

    // Update the juz test record using service-role client (bypasses RLS)
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("juz_tests")
        .update(updateData)
        .eq("id", testId)
        .select();
      if (error) throw error;
      return data;
    });

    return NextResponse.json(data[0]);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: (error as any)?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testId = searchParams.get("id");

    if (!testId) {
      return NextResponse.json(
        { error: "Missing test ID parameter" },
        { status: 400 }
      );
    }

    // Delete the juz test record using service-role client (bypasses RLS)
    await adminOperationSimple(async (client) => {
      const { error } = await client
        .from("juz_tests")
        .delete()
        .eq("id", testId);
      if (error) throw error;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: (error as any)?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
