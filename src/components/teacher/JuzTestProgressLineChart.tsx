"use client";
import { useState, useEffect, useCallback } from "react";
import { ResponsiveLine } from "@nivo/line";
import { supabase } from "@/lib/supabaseClient";
import { formatJuzTestLabel } from "@/lib/juzTestUtils";

interface JuzTest {
  id: string;
  student_id: string;
  juz_number: number;
  test_date: string;
  total_percentage: number;
  passed: boolean;
  examiner_name?: string;
  remarks?: string;
  test_juz?: boolean;
  test_hizb?: boolean;
  hizb_number?: number | null;
  page_from?: number | null;
  page_to?: number | null;
}

interface JuzTestProgressLineChartProps {
  studentId?: string;
  className?: string;
}

interface ChartDataPoint {
  x: number;
  y: number;
  juz: number;
  date: string;
  passed: boolean;
  examiner?: string;
  id: string;
  test_hizb?: boolean;
  hizb_number?: number | null;
  page_from?: number | null;
  page_to?: number | null;
}

interface ChartSeries {
  id: string;
  color: string;
  data: ChartDataPoint[];
}

export default function JuzTestProgressLineChart({ 
  studentId, 
  className = "" 
}: JuzTestProgressLineChartProps) {
  const [tests, setTests] = useState<JuzTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTestData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("juz_tests")
        .select("*")
        .order("test_date", { ascending: true });

      if (studentId) {
        query = query.eq("student_id", studentId);
      }

      const { data, error } = await query;

      if (error) {
        if (error.message?.includes('relation "public.juz_tests" does not exist')) {
          setError("Juz test system not yet set up");
        } else {
          throw error;
        }
        return;
      }

      setTests(data || []);
    } catch (err) {
      console.error("Error fetching juz test data:", err);
      setError("Failed to load test data");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchTestData();
  }, [fetchTestData]);

  // Group tests by juz_number and get the latest (best) score for each juz
  const latestTestsByJuz = tests.reduce((acc, test) => {
    const existing = acc[test.juz_number];
    if (!existing || new Date(test.test_date) > new Date(existing.test_date)) {
      acc[test.juz_number] = test;
    }
    return acc;
  }, {} as Record<number, JuzTest>);

  const chartData: ChartSeries[] = [
    {
      id: "Test Results",
      color: "#3b82f6",
      data: Object.values(latestTestsByJuz)
        .sort((a, b) => a.juz_number - b.juz_number)
        .map((test, index) => ({
          x: test.juz_number + (index * 0.001), // Ensure unique x values by adding tiny offset
          y: test.total_percentage,
          juz: test.juz_number, // Store original juz number for display
          date: test.test_date,
          passed: test.passed,
          examiner: test.examiner_name,
          id: `juz-${test.juz_number}-${test.id}`,
          test_hizb: test.test_hizb,
          hizb_number: test.hizb_number ?? null,
          page_from: test.page_from ?? null,
          page_to: test.page_to ?? null
        }))
    }
  ];

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Test Results Progress
        </h3>
        <div className="text-center py-8 text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Test Results Progress
        </h3>
        <div className="text-center py-8 text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          <p className="text-sm">No test data available</p>
          <p className="text-xs text-gray-400 mt-2">
            {studentId ? "This student hasn't taken any Juz tests yet" : "No Juz tests recorded yet"}
          </p>
        </div>
      </div>
    );
  }

  if (!Array.isArray(chartData) || chartData.length === 0 || chartData[0]?.data?.length === 0) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Test Results Progress
        </h3>
        <div className="flex h-40 items-center justify-center text-sm text-gray-500">
          No subject data available
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">
          Test Results Progress
        </h3>
        <div className="text-sm text-gray-600">
          {tests.length} test{tests.length !== 1 ? 's' : ''} recorded
        </div>
      </div>
      
      <div style={{ height: 300 }}>
        <ResponsiveLine
          data={chartData}
          animate={false}
          margin={{ top: 20, right: 50, bottom: 60, left: 60 }}
          xScale={{ 
            type: 'linear',
            min: 'auto',
            max: 'auto'
          }}
          yScale={{
            type: 'linear',
            min: 0,
            max: 100,
            stacked: false,
            reverse: false
          }}
          yFormat=" >-.1f"
          curve="monotoneX"
          axisTop={null}
          axisRight={null}
          axisBottom={{
            tickRotation: 0,
            legend: 'Juz Number',
            legendOffset: 50,
            legendPosition: 'middle',
            format: (value) => Math.round(value).toString() // Round to nearest integer for display
          }}
          axisLeft={{
            legend: 'Score (%)',
            legendOffset: -45,
            legendPosition: 'middle'
          }}
          pointSize={8}
          pointColor={{ from: 'color' }}
          pointBorderWidth={2}
          pointBorderColor={{ from: 'serieColor' }}
          pointLabelYOffset={-12}
          enableArea={false}
          useMesh={true}
          enableCrosshair={true}
          crosshairType="cross"
          colors={["#3b82f6"]}
          lineWidth={3}
          legends={[]}
          tooltip={({ point }) => {
            const data = point.data as ChartDataPoint;
            const totalTestsForJuz = tests.filter(t => t.juz_number === data.juz).length;
            return (
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                <div className="text-sm font-medium text-gray-900">
                  {formatJuzTestLabel({
                    juz_number: data.juz,
                    test_hizb: data.test_hizb,
                    hizb_number: data.hizb_number,
                    page_from: data.page_from,
                    page_to: data.page_to
                  })}{" "}
                  Test
                </div>
                {data.examiner !== 'Historical Entry' && (
                  <div className="text-sm text-gray-600">
                    Date: {new Date(data.date).toLocaleDateString()}
                  </div>
                )}
                {data.examiner === 'Historical Entry' ? (
                  <div className="text-sm text-gray-600">Result: {data.passed ? 'PASSED' : 'FAILED'}</div>
                ) : (
                  <div className="text-sm text-gray-600">Score: {data.y}%</div>
                )}
                <div className={`text-sm font-medium ${data.passed ? 'text-green-600' : 'text-red-600'}`}>
                  {data.passed ? 'PASSED' : 'FAILED'}
                </div>
                {totalTestsForJuz > 1 && (
                  <div className="text-xs text-blue-600 mt-1">
                    Latest of {totalTestsForJuz} attempts
                  </div>
                )}
                {data.examiner && data.examiner !== 'Historical Entry' && (
                  <div className="text-xs text-gray-500 mt-1">
                    Examiner: {data.examiner}
                  </div>
                )}
              </div>
            );
          }}
        />
      </div>

      {/* Pass Rate Summary */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              <span className="text-gray-600">
                Passed: {tests.filter(t => t.passed).length}
              </span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              <span className="text-gray-600">
                Failed: {tests.filter(t => !t.passed).length}
              </span>
            </div>
          </div>
          <div className="text-gray-600">
            Pass Rate: {((tests.filter(t => t.passed).length / tests.length) * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
