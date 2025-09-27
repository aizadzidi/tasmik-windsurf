"use client";

import StudentDetailsPanelShared from "@/components/exam/StudentDetailsPanelShared";
import type { StudentData } from "./StudentTable";

interface StudentDetailsPanelProps {
  student: StudentData | null;
  onClose: () => void;
  classAverages?: { [subject: string]: number };
  classOverallAvg?: number;
  isMobile?: boolean;
  selectedExamName?: string;
  reportButtonLabel?: string;
  examId?: string;
  classId?: string;
}

export default function StudentDetailsPanel(props: StudentDetailsPanelProps) {
  return <StudentDetailsPanelShared {...props} mode="admin" />;
}
                      <div className="flex items-center gap-2">
                        <button onClick={handleDownloadPdf} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">Save as PDF</button>
                        <button onClick={handlePrint} className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100">Print</button>
                        <button onClick={() => setShowReportPreview(false)} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Close</button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-gray-100">
                      <div id="report-print-area" className="bg-white p-6 md:p-8">
                        {/* School header */}
                        <div className="row flex items-center justify-between border border-gray-200 rounded-xl bg-gray-50 px-4 py-3 mb-4">
                          <div className="flex items-center gap-3">
                            <img src="/logo-akademi.png" alt="Akademi Al Khayr" width={36} height={36} className="object-contain" />
                            <div>
                              <div className="font-bold text-base">Akademi Al Khayr</div>
                              <div className="text-xs text-gray-500">Student Performance Report</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">Generated: {new Date().toLocaleString()}</div>
                        </div>

                        {/* Student header */}
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center text-white text-xl font-semibold">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h1 className="text-2xl font-semibold text-gray-900">{student.name}</h1>
                              <div className="text-gray-600">{student.class}{selectedExamName ? ` • ${selectedExamName}` : ''}</div>
                              {typeof conductWeightagePct === 'number' && (
                                <div className="text-xs text-gray-600 mt-1">Weightage: Academic {Math.max(0, 100 - conductWeightagePct)}% • Conduct {conductWeightagePct}%</div>
                              )}
                              <div className="mt-2">
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                                  overallTrend === 'positive' ? 'bg-blue-100 text-blue-700' : overallTrend === 'stable' ? 'bg-blue-50 text-blue-600' : 'bg-blue-50 text-blue-500'
                                }`}>
                                  {overallTrend === 'positive' ? 'Performing Well' : overallTrend === 'stable' ? 'Average Performance' : 'Needs Attention'}
                                </span>
                              </div>
                            </div>
                          </div>
                  <div className="text-2xl font-semibold text-gray-900">{fmt(finalWeighted ?? (typeof student.overall?.average === 'number' ? student.overall.average : null))}</div>
                        </div>

                        {/* Subjects card with chart */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">{selectedExamName ? `${selectedExamName} - Subject Marks` : 'Subject Performance Overview'}</h3>
                        <div className="avoid-break bg-gray-50 rounded-xl p-6 mb-6 border border-gray-200">
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              {!selectedSubject ? (
                                <BarChart 
                                  data={subjectSummaries.map((summary) => ({
                                    ...summary,
                                    classAvgForChart: summary.classAvg ?? undefined,
                                  }))}
                                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                >
                                  <XAxis dataKey="subject" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                  <Tooltip contentStyle={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                                  <Bar dataKey="score" fill="#3b82f6" name="Student Mark" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="classAvgForChart" fill="#9ca3af" name="Class Average" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              ) : (
                                <LineChart data={buildChartData(student.subjects?.[selectedSubject], selectedSubjectRow, (subjectSummaries.find(s=>s.subject===selectedSubject)?.classAvg ?? undefined) ?? undefined)} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                  <Tooltip />
                                  <Line type="monotone" dataKey="score" stroke="#3b82f6" name="Student" strokeWidth={2} />
                                  <Line type="monotone" dataKey="classAvg" stroke="#9ca3af" name="Class Avg" strokeDasharray="4 4" />
                                </LineChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                          {/* Subject list under chart */}
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {subjectSummaries.map((s) => (
                              <div key={s.subject} className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2">
                                <span className="text-sm text-gray-700">{s.subject}</span>
                                <span className="text-sm font-semibold">{fmt(s.score)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Conduct card with radar */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Conduct Profile <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${conductChipClass}`}>{conductChipLabel}</span></h3>
                        <div className="avoid-break bg-gray-50 rounded-xl p-6 border border-gray-200">
                          <div className="h-72">
                            <ResponsiveRadar
                              data={radarData}
                              keys={["score"]}
                              indexBy="aspect"
                              margin={{ top: 20, right: 50, bottom: 20, left: 50 }}
                              maxValue={100}
                              curve="linearClosed"
                              borderColor={{ from: 'color' }}
                              gridLevels={5}
                              gridShape="circular"
                              enableDots={true}
                              dotSize={6}
                              colors={["#3b82f6"]}
                              animate={false}
                            />
                          </div>
                          {/* Conduct items list */}
                          <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-white">
                            <div className="grid grid-cols-2 bg-gray-50 text-gray-600 text-sm font-medium px-3 py-2 border-b">
                              <div>Aspect</div>
                              <div className="text-right">Score</div>
                            </div>
                            {conductDisplayItems.map((item) => (
                              <div key={item.aspect} className="grid grid-cols-2 px-3 py-2 border-b last:border-b-0">
                                <div>{item.aspect}</div>
                                <div className="text-right font-semibold">{fmtConduct(item.value)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Portal>
            )}
            {/* Alerts removed per request */}

            {/* Subject Performance for Selected Exam */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedExamName ? `${selectedExamName} - Subject Marks` : 'Subject Performance Overview'}
              </h3>
              
              {/* Chart Area: replaces bar chart with trend when a subject is selected */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    {selectedSubject ? `${selectedSubject} - Performance Trend` : 'All Subject Marks'}
                    {selectedSubject && (selectedSubjectRow?.grade || student.subjects?.[selectedSubject]?.grade) === 'TH' && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">Absent</span>
                    )}
                  </h4>
                  {selectedSubject && (
                    <button
                      onClick={() => setSelectedSubject(null)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                      aria-label="Back to all subjects"
                    >
                      Back
                    </button>
                  )}
                </div>

                {!selectedSubject ? (
                  subjectSummaries.length > 0 ? (
                    <>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={subjectSummaries.map((summary) => ({
                              ...summary,
                              classAvgForChart: summary.classAvg ?? undefined,
                            }))}
                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            onClick={(data) => {
                              if (data && data.activeLabel) {
                                setSelectedSubject(data.activeLabel as string);
                              }
                            }}
                          >
                            <XAxis 
                              dataKey="subject" 
                              tick={{ fontSize: 12 }}
                              angle={-45}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                            <Tooltip 
                              formatter={(value: unknown, name: string, item: unknown) => {
                                const payload = (item as { payload?: ChartDatum })?.payload;
                                if (!payload) {
                                  return [fmt(toNumeric(value)), name];
                                }
                                if (name === 'Student Mark') {
                                  return [fmt(payload.score), name];
                                }
                                if (name === 'Class Average') {
                                  return [fmt(payload.classAvg), name];
                                }
                                return [fmt(toNumeric(value)), name];
                              }}
                              labelFormatter={(label) => `Subject: ${label}`}
                              contentStyle={{
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px'
                              }}
                            />
                            <Bar 
                              dataKey="score" 
                              fill="#3b82f6" 
                              name="Student Mark"
                              style={{ cursor: 'pointer' }}
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar 
                              dataKey="classAvgForChart" 
                              fill="#9ca3af" 
                              name="Class Average"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-sm text-gray-600 mt-2">
                        Click a bar or subject name to view the trend
                      </p>
                    </>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                      {subjectsLoading ? 'Loading subjects…' : 'No subject data available'}
                    </div>
                  )
                ) : (
                  (() => {
                    const subjectData = student.subjects?.[selectedSubject];
                    const selectedSummary = subjectSummaries.find(
                      (summary) => summary.subject === selectedSubject
                    );
                    const classAvgValue = selectedSummary?.classAvg ?? null;
                    const historicalData = buildChartData(
                      subjectData,
                      selectedSubjectRow,
                      classAvgValue ?? undefined
                    );
                    const scoreValue =
                      typeof subjectData?.score === 'number'
                        ? subjectData.score
                        : selectedSubjectRow
                          ? resolveMark(selectedSubjectRow)
                          : undefined;
                    const gradeValue = subjectData?.grade ?? selectedSubjectRow?.grade ?? '';

                    return (
                      <>
                        {historicalData.length > 0 ? (
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={historicalData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                                <Tooltip
                                  formatter={(value: unknown, name: string) => {
                                    if (name === 'Student') {
                                      return [fmt(toNumeric(value)), 'Student Mark'];
                                    }
                                    if (name === 'Class Avg') {
                                      return [fmt(toNumeric(value)), 'Class Average'];
                                    }
                                    return [fmt(toNumeric(value)), name];
                                  }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="score"
                                  stroke="#3b82f6"
                                  strokeWidth={3}
                                  name="Student"
                                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="classAvg"
                                  stroke="#9ca3af"
                                  strokeWidth={2}
                                  strokeDasharray="5 5"
                                  name="Class Avg"
                                  dot={{ fill: '#9ca3af', strokeWidth: 2, r: 3 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                            {subjectsLoading ? 'Loading subject details…' : 'No exam data yet for this subject'}
                          </div>
                        )}

                        {(subjectData || selectedSubjectRow) && (
                          <div className="mt-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                {typeof scoreValue === 'number' && Number.isFinite(scoreValue) && (
                                  <span className="text-lg font-semibold">{scoreValue}%</span>
                                )}
                                {gradeValue && (
                                  <span className={`text-sm px-3 py-1 rounded-full ${
                                    gradeValue === 'A' || gradeValue === 'A+' || gradeValue === 'A-' ? 'bg-blue-100 text-blue-800' :
                                    gradeValue === 'B' || gradeValue === 'B+' || gradeValue === 'B-' ? 'bg-blue-50 text-blue-700' :
                                    gradeValue === 'C' || gradeValue === 'C+' || gradeValue === 'C-' ? 'bg-blue-50 text-blue-600' :
                                    gradeValue === 'TH' ? 'bg-gray-100 text-gray-700' :
                                    'bg-blue-50 text-blue-500'
                                  }`}>
                                    {gradeValue === 'TH' ? 'Absent' : `Grade ${gradeValue}`}
                                  </span>
                                )}
                              </div>
                              {typeof scoreValue === 'number' && Number.isFinite(scoreValue) && classAvgValue != null && Number.isFinite(classAvgValue) && (
                                <div className="text-sm text-gray-600">
                                  vs Class Avg: {fmt(classAvgValue)}
                                  <span className={`ml-2 ${
                                    scoreValue > classAvgValue ? 'text-green-600' : 
                                    scoreValue === classAvgValue ? 'text-gray-600' : 'text-red-600'
                                  }`}>
                                    ({scoreValue > classAvgValue ? '+' : ''}{(scoreValue - classAvgValue).toFixed(1)}%)
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                              <div>
                                <span className="font-medium text-gray-900">Grade:</span> {gradeValue || '—'}
                              </div>
                              <div>
                                <span className="font-medium text-gray-900">Class Avg:</span> {fmt(classAvgValue)}
                              </div>
                              <div>
                                <span className="font-medium text-gray-900">Trend:</span> {subjectData?.trend ? `${subjectData.trend[subjectData.trend.length - 1] ?? 0}%` : 'Not available'}
                              </div>
                              <div>
                                <span className="font-medium text-gray-900">Exams Recorded:</span> {subjectData?.exams?.length ?? 0}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()
                )}

                {/* Minimalist Subjects and Marks Summary */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  {subjectSummaries.length > 0 ? (
                    subjectSummaries.map(({ subject, score, grade }) => {
                      const isSelected = subject === selectedSubject;
                      const displayValue = grade === 'TH' ? 'TH' : fmt(score);
                      return (
                        <button
                          key={subject}
                          type="button"
                          onClick={() => setSelectedSubject(prev => (prev === subject ? null : subject))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedSubject(prev => (prev === subject ? null : subject));
                            }
                          }}
                          className={`flex justify-between items-center px-3 py-2 rounded-lg shadow-sm border transition-colors ${
                            isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                          }`}
                          title="View trend"
                          aria-pressed={isSelected}
                        >
                          <span className="text-gray-600 font-medium text-left">{subject}</span>
                          <span className="text-gray-900 font-semibold">{displayValue}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="col-span-full text-center text-sm text-gray-400">
                      {subjectsLoading ? 'Loading subjects…' : 'No subjects recorded yet'}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Conduct Profile */}
            <div>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-gray-900">Conduct Profile</h3>
                <div className="flex items-center gap-2">
                  {conductSummaryLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  {conductSummary && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${conductChipClass}`}
                      title={conductChipTooltip}
                    >
                      {conductChipLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="h-64">
                  {hasConductData ? (
                    <ResponsiveRadar
                      key={`student-radar-${student.id}-${radarData.length}`}
                      data={radarData}
                      keys={['score']}
                      indexBy="aspect"
                      maxValue={100}
                      margin={{ top: 30, right: 40, bottom: 30, left: 40 }}
                      curve="linearClosed"
                      borderWidth={2}
                      borderColor={{ from: 'color' }}
                      gridLevels={5}
                      gridShape="circular"
                      gridLabelOffset={16}
                      enableDots={true}
                      dotSize={8}
                      dotColor={{ theme: 'background' }}
                      dotBorderWidth={2}
                      dotBorderColor={{ from: 'color' }}
                      enableDotLabel={false}
                      colors={['#3b82f6']}
                      fillOpacity={0.25}
                      blendMode="multiply"
                      animate={false}
                      isInteractive={true}
                      legends={[]}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                      No conduct data available
                    </div>
                  )}
                </div>
                
                {/* Manual Legend for Radar Chart */}
                <div className="mt-4 flex justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-gray-600">Current Score</span>
                  </div>
                </div>
                
                {/* Minimalist Conduct Summary */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {conductDisplayItems.map(item => (
                    <div key={item.aspect} className="flex justify-between items-center px-3 py-2 bg-white rounded-lg shadow-sm">
                      <span className="text-gray-600 font-medium">{item.aspect}</span>
                      <span className="text-gray-900 font-semibold">{fmtConduct(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Benchmarks */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Benchmarks</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-semibold text-blue-900">{fmt(finalWeighted ?? (typeof student.overall?.average === 'number' ? student.overall.average : null))}</div>
                  <div className="text-sm text-blue-700">Final Mark</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-semibold text-gray-900">{fmt(classAvg ?? (typeof classOverallAvg === 'number' && Number.isFinite(classOverallAvg)
                    ? classOverallAvg
                    : (Object.values(classAverages).length > 0
                        ? (Object.values(classAverages).reduce((a, b) => a + b, 0) / Object.values(classAverages).length)
                        : null))}</div>
                  <div className="text-sm text-gray-700">Class Average</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
*/
