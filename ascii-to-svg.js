/**
 * ASCII Grid to SVG converter - Stroke-based approach
 *
 * Converts ASCII grids to SVG paths with configurable stroke width.
 * This cleanly separates line thickness from spacing.
 *
 * Usage:
 *   node ascii-to-svg.js --line 2 --spacing 3
 */

const fs = require('fs');
const path = require('path');

function parseAsciiGrid(ascii) {
  const lines = ascii.trim().split('\n');
  return lines.map(line => [...line].map(char => char === '#' || char === 'X'));
}

function findHorizontalRuns(grid) {
  const runs = [];
  for (let y = 0; y < grid.length; y++) {
    let runStart = null;
    for (let x = 0; x <= grid[y].length; x++) {
      const filled = x < grid[y].length && grid[y][x];
      if (filled && runStart === null) {
        runStart = x;
      } else if (!filled && runStart !== null) {
        runs.push({ x: runStart, y, length: x - runStart, dir: 'h' });
        runStart = null;
      }
    }
  }
  return runs;
}

function findVerticalRuns(grid) {
  const runs = [];
  const height = grid.length;
  const width = Math.max(...grid.map(row => row.length));
  for (let x = 0; x < width; x++) {
    let runStart = null;
    for (let y = 0; y <= height; y++) {
      const filled = y < height && grid[y] && grid[y][x];
      if (filled && runStart === null) {
        runStart = y;
      } else if (!filled && runStart !== null) {
        runs.push({ x, y: runStart, length: y - runStart, dir: 'v' });
        runStart = null;
      }
    }
  }
  return runs;
}

/**
 * Convert a run to a stroke path segment.
 * The path goes through the CENTER of where the filled cells would be.
 */
function runToPath(run, spacing) {
  const half = spacing / 2;
  if (run.dir === 'h') {
    const y = run.y * spacing + half;
    const x1 = run.x * spacing;
    const x2 = (run.x + run.length) * spacing;
    return `M${x1},${y}H${x2}`;
  } else {
    const x = run.x * spacing + half;
    const y1 = run.y * spacing;
    const y2 = (run.y + run.length) * spacing;
    return `M${x},${y1}V${y2}`;
  }
}

function asciiToSvg(ascii, options = {}) {
  const { lineWidth = 2, spacing = 3, id = null } = options;

  const grid = parseAsciiGrid(ascii);
  const gridHeight = grid.length;
  const gridWidth = Math.max(...grid.map(row => row.length));

  const hRuns = findHorizontalRuns(grid);
  const vRuns = findVerticalRuns(grid);

  const pathSegments = [
    ...hRuns.map(r => runToPath(r, spacing)),
    ...vRuns.map(r => runToPath(r, spacing))
  ];

  const pathD = pathSegments.join('');
  const svgWidth = gridWidth * spacing;
  const svgHeight = gridHeight * spacing;
  const idAttr = id ? ` id="${id}"` : '';

  return `<svg${idAttr} width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <path d="${pathD}" stroke="currentColor" stroke-width="${lineWidth}" fill="none" stroke-linecap="square"/>
</svg>`;
}

function processFile(inputPath, outputPath, options = {}) {
  const ascii = fs.readFileSync(inputPath, 'utf-8');
  const svg = asciiToSvg(ascii, options);
  fs.writeFileSync(outputPath, svg);
  console.log(`Created: ${outputPath}`);
}

function processAllFiles(options = {}) {
  const baseDir = __dirname;
  const assetsDir = path.join(baseDir, 'assets', 'borders');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const files = ['border-left', 'border-middle', 'border-right', 'hamburger', 'question-mark'];
  for (const file of files) {
    const inputPath = path.join(baseDir, `${file}.txt`);
    if (fs.existsSync(inputPath)) {
      const outputPath = path.join(assetsDir, `${file}.svg`);
      processFile(inputPath, outputPath, { ...options, id: file });
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = { lineWidth: 2, spacing: 3 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--line' || args[i] === '-l') {
      options.lineWidth = parseFloat(args[++i]);
    } else if (args[i] === '--spacing' || args[i] === '-s') {
      options.spacing = parseFloat(args[++i]);
    }
  }

  console.log(`Line width: ${options.lineWidth}px, Spacing: ${options.spacing}px`);
  processAllFiles(options);
  console.log('Done!');
}

module.exports = { asciiToSvg, processFile, processAllFiles };
