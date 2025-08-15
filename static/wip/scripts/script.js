import {
  select,
  rollup,
  max,
  min,
  extent,
  group,
  scaleTime,
  scaleLinear,
  scaleOrdinal,
  schemeTableau10,
  axisBottom,
  axisLeft,
  timeFormat,
  line as d3Line, // rename to avoid conflict with 'line' variable
  brushX,
  easeCubicInOut,
  transition, // you often don't need to import this explicitly
} from 'd3';

let allData = [];
let scaleDataCounts = new Map();
const currentFilters = { scale: null, branches: [] };
const DOMElements = {};
const BRANCH_ICON_SVG = `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="256" width="256"/><path d="M248,120H187.5a60,60,0,0,0-118.9,0H8a8,8,0,0,0,0,16H68.6a60,60,0,0,0,118.9,0H248a8,8,0,0,0,0-16Z"/></svg>`;
let xScale, yScale, xAxis, yAxis, line, xGrid, yGrid;
let currentChartData = [];

// --- AFTER DATA WAREHOUSE ---

// Application entry point
// document.addEventListener('DOMContentLoaded', () => {
//   // Cache DOM references for efficient future use
//   cacheDOMElements();

//   // For now, let's hardcode the test and plant we want to see.
//   // Later, we can get this from the URL or a dropdown.
//   const test = 'dbt2';
//   const plant = 'plant';
//   const apiUrl = `/pf/${test}/${plant}`; // This calls your Rust route!

//   fetch(apiUrl)
//     .then((response) => {
//       if (!response.ok) {
//         throw new Error(`Network response was not ok: ${response.statusText}`);
//       }
//       return response.json(); // The Rust backend sends JSON, not text
//     })
//     .then((nestedData) => {
//       // 'nestedData' is the complex object from Rust.
//       // Now, we flatten it into the structure our chart expects.
//       allData = transformNestedDataToFlatArray(nestedData);

//       // The rest of the initialization is the same!
//       const counts =  rollup(
//         allData,
//         (v) => v.length,
//         (d) => d.scale
//       );
//       scaleDataCounts = new Map(counts);
//       initializeApp(allData);
//     })
//     .catch(handleError);
// });

// Application entry point
document.addEventListener('DOMContentLoaded', () => {
  cacheDOMElements();

  allData = transformNestedDataToFlatArray(INITIAL_DATA);

  // The rest of your app initialization is exactly the same!
  const counts = rollup(
    allData,
    (v) => v.length,
    (d) => d.scale
  );
  scaleDataCounts = new Map(counts);
  initializeApp(allData);
});

// // Make sure this is the active entry point in your script SSR
// document.addEventListener('DOMContentLoaded', () => {
//   cacheDOMElements();

//   // Get the CSV data from the DOM (SSR approach)
//   const csvText = document.getElementById('csv-data').textContent;

//   allData = parseCSV(csvText).map((d) => ({
//     branch: d.branch || 'unknown',
//     revision: d.revision,
//     scale: +d.scale,
//     // --- MODIFIED LINE ---
//     // d.ctime is now a date string like "2024-01-23 11:32:04+00",
//     // which new Date() can parse directly.
//     ctime: new Date(d.ctime),
//     metric: +d.metric,
//     commit_message: d.commit_message || `Commit: ${d.revision}`,
//   }));

//   const counts =  rollup(
//     allData,
//     (v) => v.length,
//     (d) => d.scale
//   );
//   scaleDataCounts = new Map(counts);
//   initializeApp(allData);
// });

// This becomes the active entry point for the CSR model
// document.addEventListener('DOMContentLoaded', () => {
//   cacheDOMElements();

//   // --- NEW CSR LOGIC ---
//   // 1. Get test and plant name from the browser's URL
//   // e.g., for a URL like "http://localhost:8080/mock/dbt2/plant",
//   // pathname is "/mock/dbt2/plant"
//   const pathParts = window.location.pathname.split('/').filter((p) => p);
//   const test = pathParts[1];
//   const plant = pathParts[2];

//   // 2. Check if we have the required parts, otherwise show an error.
//   if (!test || !plant) {
//     handleError(new Error('Could not determine test and plant from URL.'));
//     return;
//   }

//   // 3. Construct the API URL
//   const apiUrl = `/api/pf/${test}/${plant}`;

//   // 4. Fetch the data from the new API endpoint
//   fetch(apiUrl)
//     .then((response) => {
//       if (!response.ok) {
//         throw new Error(`Network response was not ok: ${response.statusText}`);
//       }
//       return response.json(); // The Rust backend now sends JSON
//     })
//     .then((dataFromApi) => {
//       // 5. Transform the API data into the format the chart expects
//       allData = dataFromApi.map((d) => ({
//         branch: d.branch,
//         revision: d.commit, // Map `commit` from API to `revision`
//         scale: +(d.scale.match(/(\d+)/)?.[1] || 0), // Extract number from "100 Warehouses"
//         ctime: new Date(d.commit_date), // Convert date string to Date object
//         metric: +d.metric,
//         commit_message: `Commit: ${d.commit}`,
//       }));

//       const counts =  rollup(
//         allData,
//         (v) => v.length,
//         (d) => d.scale
//       );
//       scaleDataCounts = new Map(counts);
//       initializeApp(allData);
//     })
//     .catch(handleError);
// });

/**
 * [REVISED FUNCTION]
 * Transforms the flat data array from the Actix backend into the format
 * required by the D3 chart.
 * @param {Array<object>} initialData - The flat array from the backend.
 * @returns {Array<object>} A flat array of result objects ready for
 */
function transformNestedDataToFlatArray(nestedData) {
  const flatArray = [];

  // --- THIS IS THE FIX ---
  // The 'nestedData' variable IS the scales object itself.
  const scales = nestedData;

  // Now the rest of the function will work correctly.
  for (const scale in scales) {
    const branches = scales[scale];

    for (const branchName in branches) {
      const branchData = branches[branchName];

      // The JS logic specifically uses the 'reversed' array from the data.
      if (branchData.reversed) {
        branchData.reversed.forEach((result) => {
          flatArray.push({
            branch: branchName,
            scale: +scale, // Convert scale string to a number
            revision: result.revision,
            ctime: new Date(result.ctime * 1000), // Convert Unix timestamp to JS Date
            metric: +result.metric, // Convert metric string/number to a number
          });
        });
      }
    }
  }

  return flatArray;
}

function initializeApp(data) {
  setupFilterControls(data);
  setupEventListeners();
  applyFiltersAndRender();
  updateLastUpdated(data);
}

function cacheDOMElements() {
  Object.assign(DOMElements, {
    svg: select('#chart-svg'),
    tooltip: select('.tooltip'),
    scaleFilter: document.getElementById('chooseScale'),
    legendContainer: select('#legend-container'),
    lastUpdated: document.getElementById('lastUpdated'),
    branchSelectButton: document.getElementById('branch-select-button'),
    branchFilterDropdown: document.getElementById('branch-filter-dropdown'),
    branchListContainer: document.getElementById('branch-list-container'),
    branchSelectAll: document.getElementById('branch-select-all'),
    branchDeselectAll: document.getElementById('branch-deselect-all'),
    modeZero: document.getElementById('mode-zero'),
    modeZoom: document.getElementById('mode-zoom'),
  });
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^",\n]+)(?=\s*,|\s*$)/g) || [];
    return headers.reduce((obj, header, i) => {
      obj[header] = values[i] ? values[i].replace(/^"|"$/g, '').trim() : '';
      return obj;
    }, {});
  });
}

function setupFilterControls(data) {
  // Get unique scale values, sorted numerically
  const uniqueScales = [...scaleDataCounts.keys()].sort((a, b) => a - b);

  // Clear any existing options in the options filters dropdown
  DOMElements.scaleFilter.innerHTML = '';

  // Populate the dropdown with new scale options
  uniqueScales.forEach((scale) => {
    const option = document.createElement('option'); // Create new option element
    option.value = scale; // Set the value of the option to the scale
    const count = scaleDataCounts.get(scale); // Get the count of results for this scale
    option.textContent = `${scale} (${count} results)`; // Set the visible text of the option
    DOMElements.scaleFilter.appendChild(option); //Add the option to the dropdown
  });

  // Set the current selected scale to the first available one, or null if none
  currentFilters.scale = uniqueScales[0] || null;

  // Reflect the selected scale in the dropdown UI
  DOMElements.scaleFilter.value = currentFilters.scale;

  // Update related filters (e.g., branches) based on the selected scale
  updateBranchFilter();
}

function updateYAxis(data, duration = 250) {
  if (!data || data.length === 0 || !yScale) return;

  const yAxisMode = document.querySelector(
    'input[name="y_axis_mode"]:checked'
  ).value;
  const { svg } = DOMElements;

  const [xMin, xMax] = xScale.domain();
  const visibleData = data.filter((d) => d.ctime >= xMin && d.ctime <= xMax);

  if (yAxisMode === 'zoom' && visibleData.length > 0) {
    const yMin = min(visibleData, (d) => d.metric);
    const yMax = max(visibleData, (d) => d.metric);
    yScale.domain([yMin * 0.95, yMax * 1.05]);
  } else {
    const yMax = max(data, (d) => d.metric);
    yScale.domain([0, yMax * 1.05]);
  }

  const t = svg.transition().duration(duration);
  svg.select('.axis.y-axis-group').transition(t).call(yAxis);
  svg.select('.grid.y-grid').transition(t).call(yGrid.scale(yScale));
  svg
    .selectAll('.line')
    .transition(t)
    .attr('d', ([, v]) => line(v));
  svg
    .selectAll('.data-circle')
    .transition(t)
    .attr('cx', (d) => xScale(d.ctime))
    .attr('cy', (d) => yScale(d.metric));
}

function setupEventListeners() {
  DOMElements.scaleFilter.addEventListener('change', (e) => {
    currentFilters.scale = +e.target.value;
    updateBranchFilter(true);
    applyFiltersAndRender();
  });

  document.querySelectorAll('input[name="y_axis_mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      updateYAxis(currentChartData);
    });
  });

  DOMElements.branchSelectButton.addEventListener('click', () => {
    const isHidden =
      DOMElements.branchFilterDropdown.style.display === 'none' ||
      !DOMElements.branchFilterDropdown.style.display;
    DOMElements.branchFilterDropdown.style.display = isHidden
      ? 'block'
      : 'none';
  });

  document.addEventListener('click', (e) => {
    if (
      !DOMElements.branchSelectButton.contains(e.target) &&
      !DOMElements.branchFilterDropdown.contains(e.target)
    ) {
      DOMElements.branchFilterDropdown.style.display = 'none';
    }
  });

  DOMElements.branchListContainer.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      currentFilters.branches = Array.from(
        DOMElements.branchListContainer.querySelectorAll('input:checked')
      ).map((cb) => cb.value);
      updateBranchButtonText();
      applyFiltersAndRender();
    }
  });

  DOMElements.branchSelectAll.addEventListener('click', () =>
    toggleAllBranches(true)
  );
  DOMElements.branchDeselectAll.addEventListener('click', () =>
    toggleAllBranches(false)
  );
}

function checkBounds(
  left,
  top,
  tooltipWidth,
  tooltipHeight,
  containerWidth,
  containerHeight
) {
  return (
    top >= 0 &&
    left >= 0 &&
    left + tooltipWidth <= containerWidth &&
    top + tooltipHeight <= containerHeight
  );
}

function applyFiltersAndRender() {
  const dataForScale = allData.filter((d) => d.scale === currentFilters.scale);
  const allBranchesForScale = [...new Set(dataForScale.map((d) => d.branch))]
    .sort()
    .reverse();
  console.log('All branches for scale (ordered):', allBranchesForScale);
  const colorScale = d3
    .scaleOrdinal(schemeTableau10)
    .domain(allBranchesForScale);

  console.log('ColorScale domain set to:', colorScale.domain());
  const filteredData = dataForScale.filter((d) =>
    currentFilters.branches.includes(d.branch)
  );
  renderChart(filteredData, colorScale);
  renderLegend(allBranchesForScale, colorScale);
}

function updateBranchFilter(reset = true) {
  const availableBranches = [
    ...new Set(
      allData
        .filter((d) => d.scale === currentFilters.scale)
        .map((d) => d.branch)
    ),
  ]
    .sort()
    .reverse();
  if (reset) {
    currentFilters.branches = [...availableBranches];
  }
  DOMElements.branchListContainer.innerHTML = '';
  availableBranches.forEach((branch) => {
    const id = `branch-cb-${branch.replace(/\W/g, '-')}`;
    const isChecked = currentFilters.branches.includes(branch);
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.innerHTML = `<input type="checkbox" id="${id}" value="${branch}" ${
      isChecked ? 'checked' : ''
    }><span>${branch}</span>`;
    DOMElements.branchListContainer.appendChild(label);
  });
  updateBranchButtonText();
}

function updateBranchButtonText() {
  const count = currentFilters.branches.length;
  const total =
    DOMElements.branchListContainer.querySelectorAll('input').length;
  DOMElements.branchSelectButton.textContent =
    count === total
      ? 'All Branches Selected'
      : count === 0
      ? 'No Branches Selected'
      : `${count} Branches Selected`;
}

function toggleAllBranches(select) {
  const checkboxes = DOMElements.branchListContainer.querySelectorAll('input');
  checkboxes.forEach((cb) => (cb.checked = select));
  currentFilters.branches = select
    ? Array.from(checkboxes).map((cb) => cb.value)
    : [];
  updateBranchButtonText();
  applyFiltersAndRender();
}

function renderChart(data, colorScale) {
  currentChartData = data;
  const { svg } = DOMElements;
  svg.selectAll('*').remove();
  if (data.length === 0) {
    svg
      .append('text')
      .attr('x', '50%')
      .attr('y', '50%')
      .attr('text-anchor', 'middle')
      .text('No data for selected filters.')
      .style('fill', '#6b7280');
    return;
  }

  const mainChartHeight = 400;
  const contextChartHeight = 80;
  const spacing = 60;
  svg.attr('height', mainChartHeight + spacing + contextChartHeight);

  const width = svg.node().getBoundingClientRect().width;
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = mainChartHeight - margin.top - margin.bottom;

  const xInitialDomain = extent(data, (d) => d.ctime);
  const yInitialDomain = [0, max(data, (d) => d.metric) * 1.05];

  xScale = scaleTime().domain(xInitialDomain).range([0, chartWidth]);
  yScale = scaleLinear().domain(yInitialDomain).range([chartHeight, 0]);

  const yAxisMode = document.querySelector(
    'input[name="y_axis_mode"]:checked'
  ).value;
  if (yAxisMode === 'zoom') {
    const yMin = min(data, (d) => d.metric);
    yScale.domain([yMin * 0.95, max(data, (d) => d.metric) * 1.05]);
  }

  const chart = svg
    .append('g')
    .attr('transform', `translate(${margin.left}, ${margin.top})`);
  svg
    .append('defs')
    .append('clipPath')
    .attr('id', 'chart-clip')
    .append('rect')
    .attr('width', chartWidth)
    .attr('height', chartHeight);

  xAxis = axisBottom(xScale).ticks(5).tickFormat(timeFormat('%b %d, %Y'));
  yAxis = axisLeft(yScale).ticks(8);
  xGrid = axisBottom(xScale).ticks(5).tickSize(-chartHeight).tickFormat('');
  yGrid = axisLeft(yScale).tickSize(-chartWidth).tickFormat('');

  chart
    .append('g')
    .attr('class', 'grid x-grid')
    .attr('transform', `translate(0, ${chartHeight})`)
    .call(xGrid);
  chart.append('g').attr('class', 'grid y-grid').call(yGrid);
  const xAxisGroup = chart
    .append('g')
    .attr('class', 'axis x-axis-group')
    .attr('transform', `translate(0, ${chartHeight})`)
    .call(xAxis);
  const yAxisGroup = chart
    .append('g')
    .attr('class', 'axis y-axis-group')
    .call(yAxis);

  //give this blue color
  const clipArea = chart.append('g').attr('clip-path', 'url(#chart-clip)');

  line = d3
    .line()
    .x((d) => xScale(d.ctime))
    .y((d) => yScale(d.metric));
  const groupedData = group(data, (d) => d.branch);

  clipArea
    .selectAll('.line')
    .data(groupedData)
    .join('path')
    .attr('class', 'line')
    .attr('fill', 'none')
    .attr('stroke', ([branch]) => colorScale(branch))
    .attr('stroke-width', 2)
    .attr('d', ([, v]) => line(v.sort((a, b) => a.ctime - b.ctime)));

  const contextTopPosition = mainChartHeight + margin.top;
  const contextGroup = svg
    .append('g')
    .attr('class', 'context')
    .attr('transform', `translate(${margin.left}, ${contextTopPosition})`);
  const xScale2 = scaleTime().domain(xInitialDomain).range([0, chartWidth]);
  const yContextDomain = [0, max(data, (d) => d.metric) * 1.05];
  const yScale2 = d3
    .scaleLinear()
    .domain(yContextDomain)
    .range([contextChartHeight, 0]);

  const contextLine = d3
    .line()
    .x((d) => xScale2(d.ctime))
    .y((d) => yScale2(d.metric));

  contextGroup
    .selectAll('.context-line')
    .data(groupedData)
    .join('path')
    .attr('fill', 'none')
    .attr('stroke', ([b]) => colorScale(b))
    .attr('stroke-opacity', 0.7)
    .attr('stroke-width', 1)
    .attr('d', ([, v]) => contextLine(v.sort((a, b) => a.ctime - b.ctime)));
  contextGroup
    .append('g')
    .attr('transform', `translate(0, ${contextChartHeight})`)
    .call(
      d3
        .axisBottom(xScale2)
        .ticks(width / 100)
        .tickFormat(timeFormat('%b %Y'))
    );

  // --- START OF UPDATED BRUSH LOGIC ---

  // Brush for the context chart (bottom navigator)
  const contextBrush = d3
    .brushX()
    .extent([
      [0, 0],
      [chartWidth, contextChartHeight],
    ])
    .on('end', brushedContext);

  const contextBrushGroup = contextGroup
    .append('g')
    .attr('class', 'brush context-brush')
    .call(contextBrush);

  // Brush for the X-Axis of the main chart

  const xAxisBrush = d3
    .brushX()
    .extent([
      [0, 0],
      [chartWidth, chartHeight],
    ])
    .on('end', brushedXAxis);

  const branchCircles = clipArea
    .selectAll('.data-circle')
    .data(data)
    .join('circle')
    .attr('class', 'data-circle')
    .attr('cx', (d) => xScale(d.ctime))
    .attr('cy', (d) => yScale(d.metric))
    .attr('r', 4)
    .attr('fill', (d) => colorScale(d.branch))
    .attr('stroke', 'white')
    .attr('stroke-width', 1);

  const xAxisBrushGroup = clipArea
    .append('g')
    .attr('class', 'brush xaxis-brush')
    .call(xAxisBrush);

  // Add capturing mousedown listener to the main group
  clipArea.on('mousedown.brush-reorder', function (event) {
    // Move brush to front when mousedown occurs
    xAxisBrushGroup.raise();
  });

  // Add brushend event to move brush back
  xAxisBrush.on('end.reorder', function (event) {
    // Move brush back under dots after brushing
    setTimeout(() => {
      branchCircles.raise();
    }, 50);
  });

  // Ensure circles are initially on top
  branchCircles.raise();

  setupTooltip(branchCircles, colorScale, xScale, yScale, margin);

  // --- CORRECTED LOGIC ---
  // Attach the listener to the brush overlay, which is the element
  // that actually receives the mouse events.
  xAxisBrushGroup.on('dblclick', resetZoom);
  svg
    .on('mouseover', () => window.addEventListener('keydown', handleKeyDown))
    .on('mouseout', () => window.removeEventListener('keydown', handleKeyDown));

  function redrawChart(duration = 500) {
    const t = svg.transition().duration(duration).ease(easeCubicInOut);
    xAxisGroup.transition(t).call(xAxis.scale(xScale));
    chart.select('.x-grid').transition(t).call(xGrid.scale(xScale));
    updateYAxis(currentChartData, duration);
  }

  // Handler for the new X-Axis brush
  function brushedXAxis(event) {
    if (event.selection) {
      const [x0, x1] = event.selection.map(xScale.invert);
      xScale.domain([x0, x1]);
      xAxisBrushGroup.call(xAxisBrush.move, null);
      contextBrushGroup.call(contextBrush.move, xScale.domain().map(xScale2));
      redrawChart();
    }
  }

  // Handler for the context (bottom) brush
  function brushedContext(event) {
    if (event.selection) {
      const [x0, x1] = event.selection.map(xScale2.invert);
      xScale.domain([x0, x1]);
      redrawChart();
      xAxisBrushGroup.call(xAxisBrush.move, null);
    }
  }

  function resetZoom() {
    xScale.domain(xInitialDomain);
    contextBrushGroup.call(contextBrush.move, null);
    xAxisBrushGroup.call(xAxisBrush.move, null);
    redrawChart();
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      resetZoom();
      return;
    }
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const percentage = event.key === 'ArrowLeft' ? -0.1 : 0.1;
      const [x0, x1] = xScale.domain();
      const shift = (x1 - x0) * percentage;
      xScale.domain([
        new Date(x0.getTime() + shift),
        new Date(x1.getTime() + shift),
      ]);
      contextBrushGroup.call(contextBrush.move, xScale.domain().map(xScale2));
      xAxisBrushGroup.call(xAxisBrush.move, null);
      redrawChart(100);
    }
  };
}

function setupTooltip(circles, colorScale, xScale, yScale, margin) {
  const tooltip = DOMElements.tooltip;
  const container = select('main');

  circles
    .style('cursor', 'pointer')
    .on('mouseover', function (event, d) {
      const circle = select(this).style('cursor', 'pointer').attr('r', 7);

      // Set content and make tooltip visible to measure its size
      tooltip
        .html(
          `<div class="tooltip-date">${timeFormat('%A, %B %d, %Y')(
            d.ctime
          )}</div><div class="version-item"><span class="version-color" style="background-color:${colorScale(
            d.branch
          )}"></span><span class="version-name">${
            d.branch
          }</span><span class="version-value">${d.metric.toFixed(
            2
          )}</span></div><div class="commit-details"><strong>Revision:</strong> ${d.revision.substring(
            0,
            10
          )}...<br><a href="https://github.com/postgres/postgres/commit/${
            d.revision
          }" target="_blank">View on GitHub</a></div>`
        )
        .classed('show', true);

      // Get dimensions
      const tooltipNode = tooltip.node();
      const tooltipWidth = tooltipNode.offsetWidth;
      const tooltipHeight = tooltipNode.offsetHeight;
      const offset = 20;

      // Use mouse position
      const containerRect = container.node().getBoundingClientRect();
      const pointX = event.clientX - containerRect.left;
      const pointY = event.clientY - containerRect.top;

      // Overflow-aware positioning logic
      const placements = [
        {
          name: 'top',
          x: pointX - tooltipWidth / 2,
          y: pointY - tooltipHeight - offset,
        },
        { name: 'bottom', x: pointX - tooltipWidth / 2, y: pointY + offset },
        { name: 'right', x: pointX + offset, y: pointY - tooltipHeight / 2 },
        {
          name: 'left',
          x: pointX - tooltipWidth - offset,
          y: pointY - tooltipHeight / 2,
        },
      ];

      // Find first valid placement
      let finalPlacement = null;
      for (const placement of placements) {
        if (
          placement.x >= 0 &&
          placement.y >= 0 &&
          placement.x + tooltipWidth <= containerRect.width &&
          placement.y + tooltipHeight <= containerRect.height
        ) {
          finalPlacement = placement;
          break;
        }
      }

      // Fallback to top if no valid placement
      if (!finalPlacement) {
        finalPlacement = placements[0]; // top
        // Clamp to bounds
        finalPlacement.x = Math.max(
          0,
          Math.min(finalPlacement.x, containerRect.width - tooltipWidth)
        );
        finalPlacement.y = Math.max(0, finalPlacement.y);
      }

      const arrowMap = {
        top: 'arrow-down',
        right: 'arrow-left',
        bottom: 'arrow-up',
        left: 'arrow-right',
      };

      tooltip
        .attr('class', 'tooltip show')
        .classed(arrowMap[finalPlacement.name], true)
        .style('left', `${finalPlacement.x}px`)
        .style('top', `${finalPlacement.y}px`);
    })
    .on('mouseout', function () {
      select(this).style('cursor', 'pointer').transition().attr('r', 4);

      setTimeout(() => {
        if (!tooltip.node().matches(':hover')) {
          tooltip.classed('show', false);
        }
      }, 50);
    });

  tooltip.on('mouseleave', () => {
    tooltip.classed('show', false);
  });
}

function renderLegend(branches, colorScale) {
  console.log('Rendering legend with branches:', branches);

  const { legendContainer } = DOMElements;

  const items = legendContainer
    .selectAll('.legend-item')
    .data(branches, (d) => d)
    .join(
      (enter) => {
        const item = enter
          .append('div')
          .attr('class', 'legend-item')
          .attr('data-branch', (d) => d);

        item.on('click', (event, d) => {
          const checkbox = DOMElements.branchListContainer.querySelector(
            `input[value="${d}"]`
          );
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        return item;
      },
      (update) => update, // Return update selection
      (exit) => exit.remove()
    );

  // Apply HTML and colors to ALL items (both new and existing)
  items
    .html((d) => `${BRANCH_ICON_SVG}<span>${d}</span>`)
    .each(function (d) {
      console.log(`Setting color for branch ${d}:`, colorScale(d));
      select(this).select('svg path').attr('fill', colorScale(d));
    });

  // Apply inactive class to ALL items
  items.classed('inactive', (d) => !currentFilters.branches.includes(d));
}

function updateLastUpdated(data) {
  if (!data || data.length === 0) return;
  const maxDate = max(data, (d) => d.ctime);
  DOMElements.lastUpdated.textContent = `Last updated: ${timeFormat(
    '%b %d, %Y'
  )(maxDate)}`;
}

// function parseCSV(csvText) {
//   const lines = csvText.trim().split('\n');
//   if (lines.length < 2) return [];
//   const headers = lines[0].split(',').map((h) => h.trim());
//   return lines.slice(1).map((line) => {
//     const values = line.match(/(".*?"|[^",\n]+)(?=\s*,|\s*$)/g) || [];
//     return headers.reduce((obj, header, i) => {
//       obj[header] = values[i] ? values[i].replace(/^"|"$/g, '').trim() : '';
//       return obj;
//     }, {});
//   });
// }

function handleError(error) {
  console.error('Error:', error);
  DOMElements.svg.selectAll('*').remove();
  DOMElements.svg
    .append('text')
    .attr('x', '50%')
    .attr('y', '50%')
    .attr('text-anchor', 'middle')
    .attr('fill', 'red')
    .text(`Error: ${error.message}`);
}
