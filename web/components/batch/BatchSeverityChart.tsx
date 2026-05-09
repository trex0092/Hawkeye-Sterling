"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ChartEntry {
  name: string;
  value: number;
  fill: string;
}

export default function BatchSeverityChart({ data }: { data: ChartEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#888894" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#888894" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#121215", border: "1px solid #1e1e24", borderRadius: 4, fontSize: 11 }}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
