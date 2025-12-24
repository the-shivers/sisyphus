/**
 * ASCII Grid to SVG converter - Stroke-based paths
 *
 * Identifies corners and connects them into continuous paths.
 */

const fs = require('fs');
const path = require('path');

function parseAsciiGrid(ascii) {
  const lines = ascii.trim().split('\n');
  return lines.map(line => [...line].map(char => char === '#' || char === 'X'));
}

function isFilled(grid, x, y) {
  return grid[y] && grid[y][x];
}

/**
 * Trace continuous paths through internal (non-border) cells
 */
function traceInternalPaths(grid, width, height, edges, spacing) {
  const half = spacing / 2;
  const visited = new Set();
  const paths = [];

  // Determine which cells are border cells
  const isBorder = (x, y) => {
    if (edges.top && y === 0) return true;
    if (edges.bottom && y === height - 1) return true;
    if (edges.left && x === 0) return true;
    if (edges.right && x === width - 1) return true;
    return false;
  };

  // Get internal neighbors
  const getNeighbors = (x, y) => {
    const neighbors = [];
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // up, down, left, right
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (isFilled(grid, nx, ny) && !isBorder(nx, ny)) {
        neighbors.push({ x: nx, y: ny, dx, dy });
      }
    }
    return neighbors;
  };

  // Find all internal filled cells and their endpoints
  const internalCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isFilled(grid, x, y) && !isBorder(x, y)) {
        internalCells.push({ x, y });
      }
    }
  }

  // Find endpoints (cells with exactly 1 internal neighbor) and isolated cells (0 neighbors)
  const endpoints = internalCells.filter(c => getNeighbors(c.x, c.y).length === 1);
  const isolated = internalCells.filter(c => getNeighbors(c.x, c.y).length === 0);

  // Handle isolated cells (like the dot in question mark)
  for (const cell of isolated) {
    const cx = cell.x * spacing + half;
    const cy = cell.y * spacing + half;
    // Draw as a tiny cross or just a point - using a small horizontal line
    paths.push(`M${cx - half},${cy}H${cx + half}`);
    visited.add(`${cell.x},${cell.y}`);
  }

  // Trace path from each endpoint
  for (const start of endpoints) {
    const key = `${start.x},${start.y}`;
    if (visited.has(key)) continue;

    const pathPoints = [];
    let current = start;

    while (current) {
      const k = `${current.x},${current.y}`;
      if (visited.has(k)) break;
      visited.add(k);
      pathPoints.push(current);

      const neighbors = getNeighbors(current.x, current.y)
        .filter(n => !visited.has(`${n.x},${n.y}`));

      if (neighbors.length === 0) break;
      current = neighbors[0];
    }

    if (pathPoints.length > 1) {
      paths.push(pointsToPath(pathPoints, spacing, half, width, height, edges));
    }
  }

  return paths;
}

function pointsToPath(points, spacing, half, width, height, edges) {
  const toCoord = (p) => ({ x: p.x * spacing + half, y: p.y * spacing + half, gx: p.x, gy: p.y });
  const w = width * spacing;
  const h = height * spacing;

  const start = toCoord(points[0]);
  let d = `M${start.x},${start.y}`;

  // If start is at an open edge, prepend horizontal/vertical extension FROM edge
  if (!edges.left && start.gx === 0) d = `M0,${start.y}H${start.x}`;
  if (!edges.right && start.gx === width - 1) d = `M${w},${start.y}H${start.x}`;
  if (!edges.top && start.gy === 0) d = `M${start.x},0V${start.y}`;
  if (!edges.bottom && start.gy === height - 1) d = `M${start.x},${h}V${start.y}`;

  for (let i = 1; i < points.length; i++) {
    const curr = toCoord(points[i]);
    const prev = toCoord(points[i - 1]);

    if (curr.x === prev.x) {
      d += `V${curr.y}`;
    } else {
      d += `H${curr.x}`;
    }
  }

  // If end is at an open edge, append horizontal/vertical extension TO edge
  const end = toCoord(points[points.length - 1]);
  if (!edges.left && end.gx === 0) d += `H0`;
  if (!edges.right && end.gx === width - 1) d += `H${w}`;
  if (!edges.top && end.gy === 0) d += `V0`;
  if (!edges.bottom && end.gy === height - 1) d += `V${h}`;

  return d;
}

/**
 * Check border edges
 */
function checkEdges(grid, width, height) {
  let top = true, bottom = true, left = true, right = true;
  for (let x = 0; x < width; x++) if (!isFilled(grid, x, 0)) top = false;
  for (let x = 0; x < width; x++) if (!isFilled(grid, x, height - 1)) bottom = false;
  for (let y = 0; y < height; y++) if (!isFilled(grid, 0, y)) left = false;
  for (let y = 0; y < height; y++) if (!isFilled(grid, width - 1, y)) right = false;
  return { top, bottom, left, right };
}

/**
 * Build stroke paths from grid
 */
function buildPaths(grid, spacing) {
  const height = grid.length;
  const width = Math.max(...grid.map(r => r.length));
  const half = spacing / 2;
  const paths = [];

  const edges = checkEdges(grid, width, height);
  const edgeCount = [edges.top, edges.bottom, edges.left, edges.right].filter(Boolean).length;

  // 4 edges = closed rectangle
  if (edgeCount === 4) {
    const w = width * spacing;
    const h = height * spacing;
    // Rectangle path at half spacing inset (center of border cells)
    paths.push(`M${half},${half}H${w - half}V${h - half}H${half}Z`);

    // Trace internal patterns as continuous paths
    const internalPaths = traceInternalPaths(grid, width, height, edges, spacing);
    paths.push(...internalPaths);

    return paths;
  }

  // 2 edges = top + bottom only (border-middle tile)
  if (edgeCount === 2 && edges.top && edges.bottom) {
    const w = width * spacing;
    const h = height * spacing;

    // Top border line (extends to tile edges for tiling)
    paths.push(`M0,${half}H${w}`);
    // Bottom border line
    paths.push(`M0,${h - half}H${w}`);

    // Trace internal meander as continuous path
    const internalPaths = traceInternalPaths(grid, width, height, edges, spacing);
    paths.push(...internalPaths);

    return paths;
  }

  // 3 edges = U-shaped border (border-left or border-right tiles)
  if (edgeCount === 3 && edges.top && edges.bottom) {
    const w = width * spacing;
    const h = height * spacing;

    if (edges.left && !edges.right) {
      // border-left: U opens to the right
      paths.push(`M${w},${half}H${half}V${h - half}H${w}`);
    } else if (edges.right && !edges.left) {
      // border-right: U opens to the left
      paths.push(`M0,${half}H${w - half}V${h - half}H0`);
    }

    // Trace internal pattern as continuous path(s)
    const internalPaths = traceInternalPaths(grid, width, height, edges, spacing);
    paths.push(...internalPaths);

    return paths;
  }

  // No rectangular border - use standard segment detection
  const hSegments = [];
  for (let y = 0; y < height; y++) {
    let start = null;
    for (let x = 0; x <= width; x++) {
      if (isFilled(grid, x, y) && start === null) {
        start = x;
      } else if (!isFilled(grid, x, y) && start !== null) {
        hSegments.push({ y, x1: start, x2: x - 1 });
        start = null;
      }
    }
  }

  const vSegments = [];
  for (let x = 0; x < width; x++) {
    let start = null;
    for (let y = 0; y <= height; y++) {
      if (isFilled(grid, x, y) && start === null) {
        start = y;
      } else if (!isFilled(grid, x, y) && start !== null) {
        vSegments.push({ x, y1: start, y2: y - 1 });
        start = null;
      }
    }
  }

  // Horizontal segments
  for (const seg of hSegments) {
    if (seg.x1 === seg.x2) continue;
    const py = seg.y * spacing + half;
    const isFullWidth = seg.x1 === 0 && seg.x2 === width - 1;
    const px1 = isFullWidth ? 0 : seg.x1 * spacing;
    const px2 = isFullWidth ? width * spacing : (seg.x2 + 1) * spacing;
    paths.push(`M${px1},${py}H${px2}`);
  }

  // Vertical segments
  for (const seg of vSegments) {
    if (seg.y1 === seg.y2) continue;
    const px = seg.x * spacing + half;
    const isFullHeight = seg.y1 === 0 && seg.y2 === height - 1;
    const py1 = isFullHeight ? 0 : seg.y1 * spacing;
    const py2 = isFullHeight ? height * spacing : (seg.y2 + 1) * spacing;
    paths.push(`M${px},${py1}V${py2}`);
  }

  return paths;
}

/**
 * Generic fallback: filled rectangles
 */
function filledRectangles(grid, spacing) {
  const height = grid.length;
  const width = Math.max(...grid.map(r => r.length));
  const rects = [];

  for (let y = 0; y < height; y++) {
    let start = null;
    for (let x = 0; x <= width; x++) {
      if (isFilled(grid, x, y) && start === null) {
        start = x;
      } else if (!isFilled(grid, x, y) && start !== null) {
        rects.push({ x: start * spacing, y: y * spacing, w: (x - start) * spacing, h: spacing });
        start = null;
      }
    }
  }

  return rects;
}

function rectsToPath(rects) {
  return rects.map(r => `M${r.x},${r.y}h${r.w}v${r.h}h${-r.w}z`).join('');
}

function asciiToSvg(ascii, options = {}) {
  const { lineWidth = 3, spacing = 3, id = null, useStroke = true } = options;

  const grid = parseAsciiGrid(ascii);
  const height = grid.length;
  const width = Math.max(...grid.map(r => r.length));

  const svgWidth = width * spacing;
  const svgHeight = height * spacing;

  let svgContent;

  if (useStroke) {
    const paths = buildPaths(grid, spacing);
    svgContent = `<path d="${paths.join('')}" stroke="currentColor" stroke-width="${lineWidth}" fill="none" stroke-linecap="square"/>`;
  } else {
    const rects = filledRectangles(grid, spacing);
    svgContent = `<path d="${rectsToPath(rects)}" fill="currentColor"/>`;
  }

  const idAttr = id ? ` id="${id}"` : '';

  return `<svg${idAttr} width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  ${svgContent}
</svg>`;
}

function processFile(inputPath, outputPath, options) {
  const ascii = fs.readFileSync(inputPath, 'utf-8');
  const svg = asciiToSvg(ascii, options);
  fs.writeFileSync(outputPath, svg);
  console.log(`Created: ${outputPath}`);
}

function processAllFiles(options) {
  const baseDir = __dirname;
  const assetsDir = path.join(baseDir, 'assets', 'borders');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  ['border-left', 'border-middle', 'border-right', 'hamburger', 'question-mark'].forEach(file => {
    const input = path.join(baseDir, `${file}.txt`);
    if (fs.existsSync(input)) {
      processFile(input, path.join(assetsDir, `${file}.svg`), { ...options, id: file });
    }
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = { lineWidth: 3, spacing: 3, useStroke: true };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--line' || args[i] === '-l') options.lineWidth = parseFloat(args[++i]);
    else if (args[i] === '--spacing' || args[i] === '-s') options.spacing = parseFloat(args[++i]);
    else if (args[i] === '--fill') options.useStroke = false;
  }

  console.log(`Line: ${options.lineWidth}px, Spacing: ${options.spacing}px, Mode: ${options.useStroke ? 'stroke' : 'fill'}`);
  processAllFiles(options);
  console.log('Done!');
}

module.exports = { asciiToSvg, processFile, processAllFiles };
