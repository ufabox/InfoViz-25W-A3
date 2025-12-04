// script.js

// --- Layout configuration ---
const margin = { top: 80, right: 40, bottom: 80, left: 140 };
const width = 900;
const height = 600;
const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

// Lookup tables for codes -> human-readable labels
const AGE_BAND_LABELS = {
  1: "0 - 5",
  2: "6 - 10",
  3: "11 - 15",
  4: "16 - 20",
  5: "21 - 25",
  6: "26 - 35",
  7: "36 - 45",
  8: "46 - 55",
  9: "56 - 65",
  10: "66 - 75",
  11: "Over 75"
  // -1 exists in data as "missing", but we filter those rows out
};

const CLASS_LABELS = {
  1: "Driver or rider",
  2: "Passenger",
  3: "Pedestrian"
};

// Start with KSI share as default metric
let currentMetric = "ksiRate";

// --- SVG setup ---
const svg = d3
  .select("#chart")
  .append("svg")
  .attr("viewBox", `0 0 ${width} ${height}`)
  .attr("preserveAspectRatio", "xMidYMid meet");

const chartG = svg
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

svg
  .append("text")
  .attr("class", "chart-title")
  .attr("x", width / 2)
  .attr("y", 30)
  .attr("text-anchor", "middle")
  .text("UK road casualties 2024 – injury severity by age and role");

svg
  .append("text")
  .attr("class", "axis-label")
  .attr("x", margin.left + innerWidth / 2)
  .attr("y", height - 30)
  .attr("text-anchor", "middle")
  .text("Casualty role");

svg
  .append("text")
  .attr("class", "axis-label")
  .attr(
    "transform",
    `translate(20, ${margin.top + innerHeight / 2}) rotate(-90)`
  )
  .attr("text-anchor", "middle")
  .text("Age band");

// Tooltip (HTML overlay)
const tooltip = d3
  .select("body")
  .append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

// --- Load and process data ---
d3.csv("data/dft-road-casualty-statistics-casualty-2024.csv", d3.autoType)
  .then((data) => {
    // 1) Filter to valid age bands and the three main casualty classes
    const filtered = data.filter(
      (d) =>
        d.age_band_of_casualty !== -1 &&
        (d.casualty_class === 1 ||
          d.casualty_class === 2 ||
          d.casualty_class === 3)
    );

    // 2) Aggregate data:
    //    For each (age_band_of_casualty, casualty_class) pair,
    //    compute total casualties, and number of Fatal or Serious (KSI).
    const grouped = d3.rollups(
      filtered,
      (v) => {
        const total = v.length;
        const ksi = v.filter(
          (d) => d.casualty_severity === 1 || d.casualty_severity === 2
        ).length;
        return {
          total: total,
          ksi: ksi,
          ksiRate: ksi / total // share of casualties that are fatal/serious
        };
      },
      (d) => d.age_band_of_casualty,
      (d) => d.casualty_class
    );

    // 3) Flatten the nested structure to an array of objects D3 can bind to.
    const heatmapData = [];
    grouped.forEach(([ageBandCode, byClass]) => {
      byClass.forEach(([classCode, stats]) => {
        heatmapData.push({
          ageBandCode: ageBandCode,
          ageBandLabel: AGE_BAND_LABELS[ageBandCode],
          classCode: classCode,
          classLabel: CLASS_LABELS[classCode],
          total: stats.total,
          ksi: stats.ksi,
          ksiRate: stats.ksiRate
        });
      });
    });

    // 4) Set up scales
    const ageBands = Array.from(
      new Set(heatmapData.map((d) => d.ageBandCode))
    ).sort(d3.ascending);
    const classes = [1, 2, 3]; // fixed order: Driver/rider, Passenger, Pedestrian

    const xScale = d3
      .scaleBand()
      .domain(classes)
      .range([0, innerWidth])
      .padding(0.05);

    const yScale = d3
      .scaleBand()
      .domain(ageBands)
      .range([0, innerHeight])
      .padding(0.05);

    const maxTotal = d3.max(heatmapData, (d) => d.total);
    const maxKsiRate = d3.max(heatmapData, (d) => d.ksiRate);

    const colorScale = d3
      .scaleSequential()
      .interpolator(d3.interpolateYlOrRd)
      .domain([0, maxKsiRate]); // will be updated when metric changes

    const formatPercent = d3.format(".0%");
    const formatNumber = d3.format(",");

    // 5) Axes
    const xAxis = d3
      .axisBottom(xScale)
      .tickFormat((code) => CLASS_LABELS[code]);

    const yAxis = d3
      .axisLeft(yScale)
      .tickFormat((code) => AGE_BAND_LABELS[code]);

    chartG
      .append("g")
      .attr("class", "axis x-axis")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", "12px");

    chartG
      .append("g")
      .attr("class", "axis y-axis")
      .call(yAxis)
      .selectAll("text")
      .style("font-size", "12px");

    // 6) Draw heatmap cells (one rect per age/role combination)
    const cells = chartG
      .selectAll("rect.cell")
      .data(heatmapData)
      .join("rect")
      .attr("class", "cell")
      .attr("x", (d) => xScale(d.classCode))
      .attr("y", (d) => yScale(d.ageBandCode))
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", (d) => colorScale(d.ksiRate)) // initial metric = ksiRate
      .on("mouseover", function (event, d) {
        d3.select(this).classed("cell-hover", true);
        const ksiShareText = formatPercent(d.ksiRate);
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.ageBandLabel}</strong><br/>
             Role: ${d.classLabel}<br/>
             Total casualties: ${formatNumber(d.total)}<br/>
             Fatal or serious: ${formatNumber(d.ksi)} (${ksiShareText})`
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 16 + "px")
          .style("top", event.pageY + 16 + "px");
      })
      .on("mouseleave", function () {
        d3.select(this).classed("cell-hover", false);
        tooltip.style("opacity", 0);
      });

    // 7) Function to update colors when metric changes
    function updateMetric(metric) {
      currentMetric = metric;
      const maxValue = metric === "total" ? maxTotal : maxKsiRate;
      colorScale.domain([0, maxValue]);

      cells
        .transition()
        .duration(600)
        .attr("fill", (d) => {
          const value = metric === "total" ? d.total : d.ksiRate;
          return colorScale(value);
        });

      d3.select("#metric-description").text(
        metric === "total"
          ? "Color encodes the number of casualties in each age/role group."
          : "Color encodes the share of casualties that are fatal or serious (KSI) in each age/role group."
      );
    }

    // 8) Wire up radio buttons to the update function
    d3.selectAll("input[name='metric']").on("change", (event) => {
      updateMetric(event.target.value);
    });

    // Initial description + color scale for KSI share
    updateMetric(currentMetric);
  })
  .catch((error) => {
    console.error("Error loading or processing the CSV file:", error);
  });
