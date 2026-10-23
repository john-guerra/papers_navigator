import * as d3 from "d3";
import ReactiveWidget from "reactive-widget-helper";

/**
 * Histogram with a horizontal brush; `.value = [lo, hi]` in data units.
 * Ported from @john-guerra/brushable-histogram.
 */
export function BrushableHistogram(
  data,
  {
    x = (d) => d,
    value = [],
    xLabel = "",
    width = 600,
    height = 120,
    margin = { top: 10, right: 15, bottom: 30, left: 15 },
    thresholds = 30,
    fill = "steelblue",
  } = {},
) {
  const values = data.map(x).filter((v) => Number.isFinite(v));
  const extent = d3.extent(values);
  const xScale = d3
    .scaleLinear()
    .domain(extent[0] === undefined ? [0, 1] : extent)
    .nice()
    .range([margin.left, width - margin.right]);
  const bins = d3.bin().domain(xScale.domain()).thresholds(thresholds)(values);
  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (b) => b.length) || 1])
    .range([height - margin.bottom, margin.top]);

  const svg = d3
    .create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .style("max-width", "100%")
    .style("height", "auto");

  svg
    .append("g")
    .attr("fill", fill)
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (b) => xScale(b.x0) + 0.5)
    .attr("width", (b) => Math.max(0, xScale(b.x1) - xScale(b.x0) - 1))
    .attr("y", (b) => yScale(b.length))
    .attr("height", (b) => yScale(0) - yScale(b.length));

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).ticks(width / 80))
    .call((g) =>
      g
        .append("text")
        .attr("x", width - margin.right)
        .attr("y", 25)
        .attr("fill", "currentColor")
        .attr("text-anchor", "end")
        .text(xLabel),
    );

  const element = document.createElement("div");
  element.className = "brushable-histogram";
  element.append(svg.node());
  const widget = ReactiveWidget(element, { value });

  const brush = d3
    .brushX()
    .extent([
      [margin.left, margin.top],
      [width - margin.right, height - margin.bottom],
    ])
    .on("end", (event) => {
      if (!event.sourceEvent) return; // ignore programmatic moves
      widget.setValue(event.selection ? event.selection.map(xScale.invert) : xScale.domain());
    });
  const brushG = svg.append("g").call(brush);
  if (value.length === 2) brushG.call(brush.move, value.map(xScale));

  return widget;
}
