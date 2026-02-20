import React from "react";
import { Bar } from "react-chartjs-2";
// eslint-disable-next-line
import Chart from "chart.js/auto";
import { Chart as ChartJS, Tooltip, Legend } from "chart.js";

ChartJS.register(Tooltip, Legend);

export const options = {
  responsive: true,
  plugins: {
    legend: {
      position: "top",
    },
    title: {
      display: true,
      text: "Total Orders In Last 12 Month",
    },
  },
};

export default function BarGraphs(graphData) {
  const labels = graphData.graphData.months
    ? graphData.graphData.months.map(function (e) {
        return e.value;
      })
    : "";
  const completedItem = graphData.graphData.order
    ? graphData.graphData.order.map(function (e) {
        return e.Completed;
      })
    : "";

  const data1 = {
    labels: labels,
    datasets: [
      {
        label: "Completed",
        data: completedItem,
        backgroundColor: "#63aa30",
      },
    ],
  };
  return <Bar options={options} data={data1} style={{ height: '250px' }}/>;
}
