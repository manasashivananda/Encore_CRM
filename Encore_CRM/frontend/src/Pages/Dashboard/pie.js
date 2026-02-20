import React from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function PieGraphs(graphData) {
  var labels = graphData.graphData.status
    ? graphData.graphData.status.map(function (e) {
        return e.value;
      })
    : "";
  var value = graphData.graphData.order
    ? graphData.graphData.order.map(function (e) {
        return e.count;
      })
    : "";

  const data = {
    labels: labels,
    datasets: [
      {
        data: value,
        backgroundColor: [
          "#c5ced3", //Grey
          "#f8a825", //Yellow
          "#00acc2", // Sandal
          "#1bbc9b", // sky Blue
          "#ffaf7b", // Purple
          "#e64a19", // red
        ],
        borderColor: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"],
        borderWidth: 2,
      },
    ],
  };
  return (
    <React.Fragment>
      <Pie data={data} style={{ height: '250px' }} />
    </React.Fragment>
  );
}
