import { NextRequest, NextResponse } from "next/server";
import { adminOperationSimple } from "@/lib/supabaseServiceClientSimple";

type HolidayPayload = {
  id?: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  category?: string;
};

const sanitizePayload = (payload: HolidayPayload) => {
  const title = (payload.title || "").trim();
  const start_date = payload.start_date?.slice(0, 10);
  const end_date = payload.end_date?.slice(0, 10);
  const description = payload.description?.trim() || null;
  const category = (payload.category || "holiday").trim().toLowerCase();
  return { title, start_date, end_date, description, category };
};

export async function GET() {
  try {
    const data = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("school_holidays")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    });
    return NextResponse.json({ success: true, holidays: data });
  } catch (error) {
    console.error("Admin holidays fetch error:", error);
    const message = error instanceof Error ? error.message : "Failed to load holidays";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as HolidayPayload;
    const { title, start_date, end_date, description, category } = sanitizePayload(raw);
    if (!title || !start_date || !end_date) {
      return NextResponse.json(
        { success: false, error: "Title, start date, and end date are required" },
        { status: 400 },
      );
    }
    if (new Date(start_date) > new Date(end_date)) {
      return NextResponse.json(
        { success: false, error: "Start date cannot be after end date" },
        { status: 400 },
      );
    }

    const inserted = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("school_holidays")
        .insert([{ title, start_date, end_date, description, category }])
        .select()
        .single();
      if (error) throw error;
      return data;
    });
    return NextResponse.json({ success: true, holiday: inserted });
  } catch (error) {
    console.error("Admin holidays create error:", error);
    const message = error instanceof Error ? error.message : "Failed to create holiday";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const raw = (await request.json()) as HolidayPayload;
    if (!raw.id) {
      return NextResponse.json({ success: false, error: "Holiday id is required" }, { status: 400 });
    }
    const { title, start_date, end_date, description, category } = sanitizePayload(raw);
    if (!title || !start_date || !end_date) {
      return NextResponse.json(
        { success: false, error: "Title, start date, and end date are required" },
        { status: 400 },
      );
    }
    if (new Date(start_date) > new Date(end_date)) {
      return NextResponse.json(
        { success: false, error: "Start date cannot be after end date" },
        { status: 400 },
      );
    }
    const updated = await adminOperationSimple(async (client) => {
      const { data, error } = await client
        .from("school_holidays")
        .update({ title, start_date, end_date, description, category })
        .eq("id", raw.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    });
    return NextResponse.json({ success: true, holiday: updated });
  } catch (error) {
    console.error("Admin holidays update error:", error);
    const message = error instanceof Error ? error.message : "Failed to update holiday";
    const status = message.includes("No rows") ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Holiday id is required" }, { status: 400 });
    }

    await adminOperationSimple(async (client) => {
      const { error } = await client.from("school_holidays").delete().eq("id", id);
      if (error) throw error;
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin holidays delete error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete holiday";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
