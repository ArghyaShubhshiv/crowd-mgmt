# ConPulse

**Real-time crowd-density monitoring for large events.**

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [The data flow, step by step](#the-data-flow-step-by-step)
- [Key design decisions](#key-design-decisions)
- [Performance](#performance)
- [Tech stack](#tech-stack)
- [**Running it locally**](#running-it-locally)
- [Configuration](#configuration)
- [Engineering notes & war stories](#engineering-notes--war-stories)
- [What's next?](#whats-next)

---

## What it does

An event organizer signs up, creates an event, and defines its zones (each with a location and safety thresholds) by dropping pins on a map. Once the event is live, visitor devices connect and stream location pings. ConPulse:

- **Geofences** every ping into the nearest zone.
- Maintains a **live count of people currently in each zone** over a rolling 15-second window.
- **Streams those counts** to a live dashboard (map, per-zone charts, alert feed).
- **Raises alerts** when a zone crosses its warning or critical threshold — with critical alerts prioritized over routine ones.

---

## Architecture

The system is a pipeline of small, single-purpose services decoupled by a message log. The core insight is **separation of concerns along the data flow**: ingest is dumb and fast (scales horizontally), Kafka absorbs bursts (decouples ingest speed from processing speed), the aggregator holds all analytical complexity in one place, and Redis serves reads cheaply. Each stage scales and fails independently.

<svg id="mermaid-1783247563195-ny7zrxqbt" width="100%" xmlns="http://www.w3.org/2000/svg" class="flowchart" style="max-width: 2648.037353515625px;" viewBox="0 -0.00000762939453125 2648.037353515625 342.79266357421875" role="graphics-document document" aria-roledescription="flowchart-v2"><style>#mermaid-1783247563195-ny7zrxqbt{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;fill:#333;}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#mermaid-1783247563195-ny7zrxqbt .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#mermaid-1783247563195-ny7zrxqbt .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#mermaid-1783247563195-ny7zrxqbt .error-icon{fill:#552222;}#mermaid-1783247563195-ny7zrxqbt .error-text{fill:#552222;stroke:#552222;}#mermaid-1783247563195-ny7zrxqbt .edge-thickness-normal{stroke-width:1px;}#mermaid-1783247563195-ny7zrxqbt .edge-thickness-thick{stroke-width:3.5px;}#mermaid-1783247563195-ny7zrxqbt .edge-pattern-solid{stroke-dasharray:0;}#mermaid-1783247563195-ny7zrxqbt .edge-thickness-invisible{stroke-width:0;fill:none;}#mermaid-1783247563195-ny7zrxqbt .edge-pattern-dashed{stroke-dasharray:3;}#mermaid-1783247563195-ny7zrxqbt .edge-pattern-dotted{stroke-dasharray:2;}#mermaid-1783247563195-ny7zrxqbt .marker{fill:#333333;stroke:#333333;}#mermaid-1783247563195-ny7zrxqbt .marker.cross{stroke:#333333;}#mermaid-1783247563195-ny7zrxqbt svg{font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:16px;}#mermaid-1783247563195-ny7zrxqbt p{margin:0;}#mermaid-1783247563195-ny7zrxqbt .label{font-family:"trebuchet ms",verdana,arial,sans-serif;color:#333;}#mermaid-1783247563195-ny7zrxqbt .cluster-label text{fill:#333;}#mermaid-1783247563195-ny7zrxqbt .cluster-label span{color:#333;}#mermaid-1783247563195-ny7zrxqbt .cluster-label span p{background-color:transparent;}#mermaid-1783247563195-ny7zrxqbt .label text,#mermaid-1783247563195-ny7zrxqbt span{fill:#333;color:#333;}#mermaid-1783247563195-ny7zrxqbt .node rect,#mermaid-1783247563195-ny7zrxqbt .node circle,#mermaid-1783247563195-ny7zrxqbt .node ellipse,#mermaid-1783247563195-ny7zrxqbt .node polygon,#mermaid-1783247563195-ny7zrxqbt .node path{fill:#ECECFF;stroke:#9370DB;stroke-width:1px;}#mermaid-1783247563195-ny7zrxqbt .rough-node .label text,#mermaid-1783247563195-ny7zrxqbt .node .label text,#mermaid-1783247563195-ny7zrxqbt .image-shape .label,#mermaid-1783247563195-ny7zrxqbt .icon-shape .label{text-anchor:middle;}#mermaid-1783247563195-ny7zrxqbt .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#mermaid-1783247563195-ny7zrxqbt .rough-node .label,#mermaid-1783247563195-ny7zrxqbt .node .label,#mermaid-1783247563195-ny7zrxqbt .image-shape .label,#mermaid-1783247563195-ny7zrxqbt .icon-shape .label{text-align:center;}#mermaid-1783247563195-ny7zrxqbt .node.clickable{cursor:pointer;}#mermaid-1783247563195-ny7zrxqbt .root .anchor path{fill:#333333!important;stroke-width:0;stroke:#333333;}#mermaid-1783247563195-ny7zrxqbt .arrowheadPath{fill:#333333;}#mermaid-1783247563195-ny7zrxqbt .edgePath .path{stroke:#333333;stroke-width:2.0px;}#mermaid-1783247563195-ny7zrxqbt .flowchart-link{stroke:#333333;fill:none;}#mermaid-1783247563195-ny7zrxqbt .edgeLabel{background-color:rgba(232,232,232, 0.8);text-align:center;}#mermaid-1783247563195-ny7zrxqbt .edgeLabel p{background-color:rgba(232,232,232, 0.8);}#mermaid-1783247563195-ny7zrxqbt .edgeLabel rect{opacity:0.5;background-color:rgba(232,232,232, 0.8);fill:rgba(232,232,232, 0.8);}#mermaid-1783247563195-ny7zrxqbt .labelBkg{background-color:rgba(232, 232, 232, 0.5);}#mermaid-1783247563195-ny7zrxqbt .cluster rect{fill:#ffffde;stroke:#aaaa33;stroke-width:1px;}#mermaid-1783247563195-ny7zrxqbt .cluster text{fill:#333;}#mermaid-1783247563195-ny7zrxqbt .cluster span{color:#333;}#mermaid-1783247563195-ny7zrxqbt div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:"trebuchet ms",verdana,arial,sans-serif;font-size:12px;background:hsl(80, 100%, 96.2745098039%);border:1px solid #aaaa33;border-radius:2px;pointer-events:none;z-index:100;}#mermaid-1783247563195-ny7zrxqbt .flowchartTitleText{text-anchor:middle;font-size:18px;fill:#333;}#mermaid-1783247563195-ny7zrxqbt rect.text{fill:none;stroke-width:0;}#mermaid-1783247563195-ny7zrxqbt .icon-shape,#mermaid-1783247563195-ny7zrxqbt .image-shape{background-color:rgba(232,232,232, 0.8);text-align:center;}#mermaid-1783247563195-ny7zrxqbt .icon-shape p,#mermaid-1783247563195-ny7zrxqbt .image-shape p{background-color:rgba(232,232,232, 0.8);padding:2px;}#mermaid-1783247563195-ny7zrxqbt .icon-shape rect,#mermaid-1783247563195-ny7zrxqbt .image-shape rect{opacity:0.5;background-color:rgba(232,232,232, 0.8);fill:rgba(232,232,232, 0.8);}#mermaid-1783247563195-ny7zrxqbt .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#mermaid-1783247563195-ny7zrxqbt .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#mermaid-1783247563195-ny7zrxqbt :root{--mermaid-font-family:"trebuchet ms",verdana,arial,sans-serif;}</style><g><marker id="mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="4.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 5 L 10 10 L 10 0 z" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></path></marker><marker id="mermaid-1783247563195-ny7zrxqbt_flowchart-v2-circleEnd" class="marker flowchart-v2" viewBox="0 0 10 10" refX="11" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="mermaid-1783247563195-ny7zrxqbt_flowchart-v2-circleStart" class="marker flowchart-v2" viewBox="0 0 10 10" refX="-1" refY="5" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><circle cx="5" cy="5" r="5" class="arrowMarkerPath" style="stroke-width: 1; stroke-dasharray: 1, 0;"></circle></marker><marker id="mermaid-1783247563195-ny7zrxqbt_flowchart-v2-crossEnd" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="12" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><marker id="mermaid-1783247563195-ny7zrxqbt_flowchart-v2-crossStart" class="marker cross flowchart-v2" viewBox="0 0 11 11" refX="-1" refY="5.2" markerUnits="userSpaceOnUse" markerWidth="11" markerHeight="11" orient="auto"><path d="M 1,1 l 9,9 M 10,1 l -9,9" class="arrowMarkerPath" style="stroke-width: 2; stroke-dasharray: 1, 0;"></path></marker><g class="root"><g class="clusters"></g><g class="edgePaths"><path d="M171.85,103.022L185.97,103.022C200.09,103.022,228.329,103.022,255.902,103.022C283.475,103.022,310.381,103.022,323.834,103.022L337.288,103.022" id="L_P_WS_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M474.85,88.685L489.084,85.629C503.319,82.572,531.788,76.46,559.59,73.404C587.392,70.348,614.527,70.348,628.095,70.348L641.663,70.348" id="L_WS_K_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M772.038,70.348L786.76,70.348C801.483,70.348,830.929,70.348,859.708,70.348C888.488,70.348,916.6,70.348,930.656,70.348L944.713,70.348" id="L_K_AGG_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M1146.738,88.17L1160.49,90.646C1174.242,93.121,1201.746,98.072,1228.625,105.432C1255.505,112.792,1281.759,122.562,1294.886,127.447L1308.014,132.332" id="L_AGG_R_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M474.85,131.402L489.084,137.451C503.319,143.5,531.788,155.598,570.788,161.647C609.788,167.696,659.319,167.696,709.339,167.696C759.358,167.696,809.867,167.696,866.346,167.696C922.825,167.696,985.275,167.696,1046.754,167.696C1108.233,167.696,1168.742,167.696,1212.082,167.338C1255.421,166.979,1281.593,166.261,1294.678,165.902L1307.764,165.543" id="L_WS_R_0" class=" edge-thickness-normal edge-pattern-dotted edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M1470.475,163.257L1474.642,163.257C1478.808,163.257,1487.142,163.257,1500.248,168.573C1513.354,173.889,1531.233,184.522,1540.173,189.838L1549.113,195.154" id="L_R_DP_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M1715.788,236.199L1730.988,236.199C1746.188,236.199,1776.588,236.199,1806.321,236.199C1836.054,236.199,1865.121,236.199,1879.654,236.199L1894.188,236.199" id="L_DP_UI_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M1146.738,61.621L1160.49,60.409C1174.242,59.197,1201.746,56.772,1242.476,55.56C1283.206,54.348,1337.163,54.348,1381.533,54.348C1425.904,54.348,1460.69,54.348,1498.525,54.348C1536.36,54.348,1577.246,54.348,1629.165,54.348C1681.083,54.348,1744.035,54.348,1805.583,54.348C1867.131,54.348,1927.275,54.348,1990.5,54.348C2053.725,54.348,2120.031,54.348,2186.736,54.348C2253.442,54.348,2320.546,54.348,2373.535,54.348C2426.525,54.348,2465.4,54.348,2492.954,68.088C2520.509,81.828,2536.742,109.308,2544.859,123.048L2552.976,136.788" id="L_AGG_PG_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M1123.106,259.055L1140.797,253.506C1158.488,247.956,1193.869,236.858,1224.69,226.238C1255.51,215.619,1281.771,205.479,1294.901,200.409L1308.031,195.339" id="L_ALERT_R_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M1123.106,289.993L1140.797,291.705C1158.488,293.416,1193.869,296.839,1230.902,298.55C1267.935,300.261,1306.621,300.261,1325.964,300.261L1345.306,300.261" id="L_ALERT_MQ_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M1432.931,300.261L1443.355,300.261C1453.779,300.261,1474.627,300.261,1492.458,296.393C1510.288,292.524,1525.102,284.787,1532.508,280.919L1539.915,277.051" id="L_MQ_DP_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M2479.275,236.199L2483.442,236.199C2487.608,236.199,2495.942,236.199,2503.705,234.021C2511.468,231.843,2518.661,227.488,2522.257,225.31L2525.853,223.132" id="L_API_PG_0" class=" edge-thickness-normal edge-pattern-solid edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path><path d="M2076.65,236.199L2094.931,236.199C2113.213,236.199,2149.775,236.199,2185.671,236.199C2221.567,236.199,2256.796,236.199,2274.41,236.199L2292.025,236.199" id="L_UI_API_0" class=" edge-thickness-normal edge-pattern-dotted edge-thickness-normal edge-pattern-solid flowchart-link" style="" marker-end="url(#mermaid-1783247563195-ny7zrxqbt_flowchart-v2-pointEnd)"></path></g><g class="edgeLabels"><g class="edgeLabel" transform="translate(256.5687561035156, 103.02232551574707)"><g class="label" transform="translate(-59.71875, -12)"><foreignObject width="119.4375" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>WebSocket pings</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(560.2562561035156, 70.34821701049805)"><g class="label" transform="translate(-60.40625, -12)"><foreignObject width="120.8125" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>batched produce</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(860.3750076293945, 70.34821701049805)"><g class="label" transform="translate(-57.00625228881836, -12)"><foreignObject width="114.01250457763672" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>consumer group</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(1229.2500190734863, 103.02232551574707)"><g class="label" transform="translate(-57.51250076293945, -12)"><foreignObject width="115.0250015258789" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>per-zone counts</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(860.3750076293945, 167.6964340209961)"><g class="label" transform="translate(-63.337501525878906, -12)"><foreignObject width="126.67500305175781" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>presence markers</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(1806.987533569336, 236.19874382019043)"><g class="label" transform="translate(-38.743751525878906, -12)"><foreignObject width="77.48750305175781" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>live counts</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(1806.987533569336, 54.34821701049805)"><g class="label" transform="translate(-66.20000457763672, -12)"><foreignObject width="132.40000915527344" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>periodic snapshots</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(1229.2500190734863, 225.75890731811523)"><g class="label" transform="translate(-53.54999923706055, -12)"><foreignObject width="107.0999984741211" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>reads densities</p></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(1229.2500190734863, 300.26121711730957)"><g class="label" transform="translate(-49.50625228881836, -12)"><foreignObject width="99.01250457763672" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>priority alerts</p></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "></span></div></foreignObject></g></g><g class="edgeLabel"><g class="label" transform="translate(0, 0)"><foreignObject width="0" height="0"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "></span></div></foreignObject></g></g><g class="edgeLabel" transform="translate(2186.337532043457, 236.19874382019043)"><g class="label" transform="translate(-84.6875, -12)"><foreignObject width="169.375" height="24"><div xmlns="http://www.w3.org/1999/xhtml" class="labelBkg" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="edgeLabel "><p>auth, event/zone setup</p></span></div></foreignObject></g></g></g><g class="nodes"><g class="node default  " id="flowchart-P-0" transform="translate(89.92500305175781, 103.02232551574707)"><rect class="basic label-container" style="" x="-81.92499923706055" y="-27" width="163.8499984741211" height="54"></rect><g class="label" style="" transform="translate(-51.92499923706055, -12)"><rect></rect><foreignObject width="103.8499984741211" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel "><p>Visitor devices</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-WS-1" transform="translate(408.0687561035156, 103.02232551574707)"><rect class="basic label-container" style="fill:#2d3748 !important" x="-66.78125" y="-39" width="133.5625" height="78"></rect><g class="label" style="color:#fff !important" transform="translate(-36.78125, -24)"><rect></rect><foreignObject width="73.5625" height="48"><div style="color: rgb(255, 255, 255) !important; display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;" xmlns="http://www.w3.org/1999/xhtml"><span style="color:#fff !important" class="nodeLabel "><p>ws-server<br/>ingest tier</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-K-3" transform="translate(708.8500061035156, 70.34821701049805)"><path d="M0,12.568373943311785 a63.1875,12.568373943311785 0,0,0 126.375,0 a63.1875,12.568373943311785 0,0,0 -126.375,0 l0,99.56837394331178 a63.1875,12.568373943311785 0,0,0 126.375,0 l0,-99.56837394331178" class="basic label-container" style="fill:#4a5568 !important" label-offset-y="12.568373943311785" transform="translate(-63.1875, -62.352560914967675)"></path><g class="label" style="color:#fff !important" transform="translate(-55.6875, -26)"><rect></rect><foreignObject width="111.375" height="72"><div style="color: rgb(255, 255, 255) !important; display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;" xmlns="http://www.w3.org/1999/xhtml"><span style="color:#fff !important" class="nodeLabel "><p>Kafka<br/>topic: locations<br/>6 partitions</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-AGG-5" transform="translate(1047.7250137329102, 70.34821701049805)"><rect class="basic label-container" style="fill:#2d3748 !important" x="-99.01250457763672" y="-39" width="198.02500915527344" height="78"></rect><g class="label" style="color:#fff !important" transform="translate(-69.01250457763672, -24)"><rect></rect><foreignObject width="138.02500915527344" height="48"><div style="color: rgb(255, 255, 255) !important; display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;" xmlns="http://www.w3.org/1999/xhtml"><span style="color:#fff !important" class="nodeLabel "><p>aggregator<br/>geofence + window</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-R-7" transform="translate(1391.1187744140625, 163.2565975189209)"><path d="M0,13.985328812943829 a79.35625457763672,13.985328812943829 0,0,0 158.71250915527344,0 a79.35625457763672,13.985328812943829 0,0,0 -158.71250915527344,0 l0,76.98532881294383 a79.35625457763672,13.985328812943829 0,0,0 158.71250915527344,0 l0,-76.98532881294383" class="basic label-container" style="fill:#4a5568 !important" label-offset-y="13.985328812943829" transform="translate(-79.35625457763672, -52.477993219415744)"></path><g class="label" style="color:#fff !important" transform="translate(-71.85625457763672, -14)"><rect></rect><foreignObject width="143.71250915527344" height="48"><div style="color: rgb(255, 255, 255) !important; display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;" xmlns="http://www.w3.org/1999/xhtml"><span style="color:#fff !important" class="nodeLabel "><p>Redis<br/>sorted sets + hashes</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-DP-11" transform="translate(1618.1312789916992, 236.19874382019043)"><rect class="basic label-container" style="" x="-97.65625" y="-39" width="195.3125" height="78"></rect><g class="label" style="" transform="translate(-67.65625, -24)"><rect></rect><foreignObject width="135.3125" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel "><p>dashboard-push<br/>WebSocket fan-out</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-UI-13" transform="translate(1987.4187850952148, 236.19874382019043)"><rect class="basic label-container" style="" x="-89.23125076293945" y="-27" width="178.4625015258789" height="54"></rect><g class="label" style="" transform="translate(-59.23125076293945, -12)"><rect></rect><foreignObject width="118.4625015258789" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel "><p>React dashboard</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-PG-15" transform="translate(2584.6562843322754, 187.5246353149414)"><path d="M0,11.745135722076045 a55.38125228881836,11.745135722076045 0,0,0 110.76250457763672,0 a55.38125228881836,11.745135722076045 0,0,0 -110.76250457763672,0 l0,74.74513572207604 a55.38125228881836,11.745135722076045 0,0,0 110.76250457763672,0 l0,-74.74513572207604" class="basic label-container" style="fill:#4a5568 !important" label-offset-y="11.745135722076045" transform="translate(-55.38125228881836, -49.117703583114064)"></path><g class="label" style="color:#fff !important" transform="translate(-47.88125228881836, -14)"><rect></rect><foreignObject width="95.76250457763672" height="48"><div style="color: rgb(255, 255, 255) !important; display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;" xmlns="http://www.w3.org/1999/xhtml"><span style="color:#fff !important" class="nodeLabel "><p>PostgreSQL<br/>durable state</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-ALERT-16" transform="translate(1047.7250137329102, 282.70105361938477)"><rect class="basic label-container" style="" x="-75.38125228881836" y="-27" width="150.76250457763672" height="54"></rect><g class="label" style="" transform="translate(-45.38125228881836, -12)"><rect></rect><foreignObject width="90.76250457763672" height="24"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel "><p>alert-service</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-MQ-19" transform="translate(1391.1187744140625, 300.26121711730957)"><path d="M0,10.020970641102457 a41.8125,10.020970641102457 0,0,0 83.625,0 a41.8125,10.020970641102457 0,0,0 -83.625,0 l0,49.02097064110246 a41.8125,10.020970641102457 0,0,0 83.625,0 l0,-49.02097064110246" class="basic label-container" style="fill:#4a5568 !important" label-offset-y="10.020970641102457" transform="translate(-41.8125, -34.531455961653684)"></path><g class="label" style="color:#fff !important" transform="translate(-34.3125, -2)"><rect></rect><foreignObject width="68.625" height="24"><div style="color: rgb(255, 255, 255) !important; display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;" xmlns="http://www.w3.org/1999/xhtml"><span style="color:#fff !important" class="nodeLabel "><p>RabbitMQ</p></span></div></foreignObject></g></g><g class="node default  " id="flowchart-API-22" transform="translate(2387.650032043457, 236.19874382019043)"><rect class="basic label-container" style="" x="-91.625" y="-39" width="183.25" height="78"></rect><g class="label" style="" transform="translate(-61.625, -24)"><rect></rect><foreignObject width="123.25" height="48"><div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell; white-space: nowrap; line-height: 1.5; max-width: 200px; text-align: center;"><span class="nodeLabel "><p>control-plane API<br/>Fastify</p></span></div></foreignObject></g></g></g></g></g></svg>

- **PostgreSQL** holds *durable structure* — users, orgs, events, zone definitions, density history. Slow-changing, relational, transactional.
- **Redis** holds the *live present moment* — who's in which zone right now. Fast, in-memory, overwritten constantly, self-healing.
- **In-memory cache** stores the latest timestamp of each user. It reduces the unnecessary Redis writes and checks in case the ping received is older than the newest ping; or the user has remained stationary for a while.  
- **Kafka** is the *stream between them*.

---

## The data flow, step by step

1. **Ingest (`ws-server`).** Visitor devices open WebSockets and stream pings. The ingest server does pushes the pings into an in-memory batch. A background timer flushes the whole batch to Kafka once per second. It holds no analytical state.

2. **Buffer (`Kafka`).** Pings land on the `locations` topic, partitioned 6 ways and keyed by visitor token — which spreads load evenly across partitions while keeping each visitor's pings ordered on one partition.

3. **Aggregate (`aggregator`).** A consumer group reads the stream. For each ping it computes the nearest zone (geofencing) and refreshes that visitor's presence in a Redis sorted set scored by arrival time. A background loop evicts anyone older than the 15-second window and writes the resulting count as each zone's live density. An in-memory L1 cache skips redundant writes for stationary visitors, cutting Redis writes ~3.9×. Stationary users are periodically heartbeated to Redis to avoid eviction. 

4. **Serve (`Redis`).** The live per-zone counts sit in Redis, read cheaply by downstream services.

5. **Fan out (`dashboard-push`).** Reads live densities from Redis and streams them over WebSockets to every open dashboard. Also relays alerts from RabbitMQ.

6. **Display (`web`).** A React dashboard renders the live map, per-zone density charts, and the alert feed.

**Alongside the hot path:**

- **`alert-service`** polls densities and publishes alerts through RabbitMQ when a zone changes severity (edge-triggered — one alert per transition, not a stream), with critical alerts ranked above routine ones via priority queues.
- **`api`** (control-plane) is the non-real-time side: auth, and the organizer flow for creating orgs, events, and zones.

---

## Key design decisions

**Kafka for telemetry, RabbitMQ for alerts.** Pings are a high-volume, ordered, replayable stream, so it is done by Kafka. Its partitioning is what enables parallel processing. Alerts are the opposite: rare, discrete, and rankable. A critical crowd-crush alert must preempt routine notices, which a strictly-ordered Kafka log cannot do but a RabbitMQ priority queue can. Two traffic types, two tools.

**At-most-once ingest, at-least-once alerts.** Under overload the ingest tier *drops* pings rather than buffering them into an out-of-memory crash — safe because density is self-refreshing (each visitor pings repeatedly, so a dropped ping is one lost sample, not a lost person). Alerts take the opposite approach, because a lost crowd-crush warning is unacceptable.

**Geofencing by nearest-center.** Each ping is assigned to the nearest zone center using a cheap planar distance approximation. Simpler than polygon containment and accurate enough for well-separated zones; PostGIS polygons are the upgrade path if zones become irregular.

---

## Performance

Measured on a single machine running the full stack plus a co-located load generator. These are the load generator's ceiling, not the system's — the pipeline was still healthy at peak.

| Metric | Result |
|---|---|
| Sustained concurrent connections | ~28,000 |
| Throughput (single consumer → scaled) | ~1,200 → ~28,000 msgs/sec |
| Processing latency (p95, balanced 3-consumer group) | ~1.05 s |
| Redis write reduction (L1 cache, measured) | \~3.9x (~74% of writes skipped) |
| Load-shedding fairness | uniform per-zone acceptance (verified) |

**Scaling story.** A single consumer processes ~1,200 msgs/sec and falls behind (unbounded lag) under higher load. Partitioning the topic 6 ways and running a balanced consumer group brings lag under control (bounded, self-recovering) and raises sustained throughput accordingly.

**Latency framing.** The ~1 s figure is an *under-load* measurement on constrained single-machine hardware, with real per-ping work in that window (geofencing, Redis sliding-window operations, Kafka hops). Under capacity it stays bounded and stable; it climbs only when consumers are deliberately saturated.

---

## Tech stack

| Layer | Technology |
|---|---|
| Ingest & services | Node.js, Fastify, `@fastify/websocket` |
| Streaming | Apache Kafka (KRaft mode), KafkaJS |
| Live state | Redis (sorted sets, hashes), ioredis |
| Durable state | PostgreSQL, `pg` |
| Alerts | RabbitMQ (topic exchange, priority queues), amqplib |
| Frontend | React, Vite, Leaflet, Recharts |
| Auth | JWT, bcrypt |
| Infrastructure | Docker Compose |

---

## Running it locally

**Prerequisites:** Node.js 18+, Docker & Docker Compose.

```bash
# 1. Start the backing infrastructure (Kafka, Redis, Postgres, RabbitMQ)
docker compose -f infra/docker-compose.yml up -d

# 2. Install dependencies (workspaces)
npm install

# 3. Initialize the database schema
psql "$DATABASE_URL" -f db/0001_init.sql

# 4. Start the services (each in its own terminal, or via run-stack.sh)
npm run start --workspace services/api
npm run start --workspace services/ws-server
npm run start --workspace services/aggregator
npm run start --workspace services/dashboard-push
npm run start --workspace services/alert-service

# 5. Start the dashboard
npm run dev --workspace web

# 6. Generate load (simulated crowd of 2000 visitors)
node simulator/feed.js 2000
```

Then open the dashboard, sign up, create an event and its zones, activate it, and point the simulator at its slug to watch the crowd move in real time.

> **Note:** the aggregator can be scaled by starting multiple instances — they form a Kafka consumer group and share the partitions. For balanced load, use a consumer count that divides the partition count (1, 2, 3, or 6).

---

## Configuration

Services read configuration from environment variables (via a `.env` file at the repo root):

| Variable | Purpose |
|---|---|
| `KAFKA_BROKERS` | comma-separated broker addresses |
| `REDIS_URL` | Redis connection string |
| `DATABASE_URL` | PostgreSQL connection string |
| `RABBITMQ_URL` | RabbitMQ connection string |
| `JWT_SECRET` | secret for signing auth tokens |
| `WS_PORT` | ingest WebSocket port (default 3002) |

---

## Engineering notes \& war stories

These are some of the problems I faced during development and how each was tackled.

1. <u>**The ingest out-of-memory (OOM) crash**</u>

* **Symptom:** under load the ingest server climbed to \~2 GB and crashed, taking the live view to zero.
* **Cause:** un-awaited `producer.send()` calls per ping — fire-and-forget I/O that buffered unboundedly in the heap faster than Kafka could drain it.
* **False start:** awaiting each send *still* OOM'd — the WebSocket kept firing message events, so pending handler closures piled up instead of pending sends. Awaiting inside an event handler doesn't slow the event *source*.
* **Fix:** make the handler do *no* awaited work — synchronously push each ping onto an in-memory array, and let a timer flush the whole batch to Kafka once per second. A bounded cap on the array sheds load rather than growing unboundedly.
* **Result:** memory went flat.

2(a). <u>**Load-shedding without losing the crowd**</u>

* **The worry:** dropping pings sounds like dropping people.
* **Why it isn't:** each visitor pings repeatedly, and density is a windowed count that needs only *one* recent ping per person to register them. A dropped ping is a lost sample, not a lost person.
* **Why zones stay fair:** shedding is content-blind — it drops whatever arrives when saturated, so drops distribute proportionally across all zones. The crowd's *shape* is preserved; only its update frequency drops.
* **How it was verified:** compared per-zone *sent* counts (from the load generator, classified by the same geofencing rule) against *received* counts (from the aggregator). Acceptance stayed uniform across zones under shedding — proof the degradation was even, not biased.

2(b). <u>**Inaccurate metric while measuring shape-distortion due to load-shedding**</u>

* **Symptom:** a per-zone "received" counter read \~44% of "sent" even at trivial load with no shedding — apparent unfairness.
* **Cause:** The counter increment was queued into a Redis pipeline that only got executed when a density write also occurred — but stationary visitors, by design, skip density writes via my L1 cache. So on write-less batches, the pipeline was skipped and the queued count increments were silently discarded. The pings were processed fine; the measurement was throwing away its own data on exactly the batches where the cache did its job.
* **Diagnosis:** the system was fine; the *measurement* was broken.
* **Fix:** execute the pipeline whenever *anything* was queued, not only when a write happened.

3. <u>**Density suddenly crashed to zero**</u>

* **Symptom:** the dashboard would occasionally collapse to zero and stick there.
* **Cause 1 (watermark wipe):** an event-time watermark used for window cleanup would lurch forward at stream discontinuities and evict entire zones at once.
* **Cause 2 (clock mismatch):** visitors were *scored* in the Redis sorted set by their lagged event timestamp but *evicted* against wall-clock time. Once lag exceeded the window, every newly-added visitor was already older than the eviction cutoff — deleted the instant it was added.
* **Fix:** score by ingestion (wall-clock) time, so adding and evicting speak the same clock.
* **Lesson:** event-time answers "which happened first," wall-clock answers "how long ago" — never compare one against the other.

---

## What's next?

- **Backing stores are single-node** (Kafka, Redis, Postgres) — the real single points of failure. Production: cluster/replicate all three.
- **Ingest clustering is single-machine** (Node `cluster` module). Production: replicated stateless containers behind a load balancer under an orchestrator, which also survives whole-machine failure — the cluster primary is itself an unsupervised single point of failure.
- **Load numbers are from a co-located synthetic generator**, so they reflect the test rig's ceiling, not the system's. Real load testing uses separate generator machines.
- **Geofencing is nearest-center**, not true polygons. Upgrade path: PostGIS.
- **`density_history` is a plain table.** At production time-series volume: TimescaleDB (a Postgres extension) for partitioning and retention.
- **RabbitMQ reconnect lacks backoff**, and alerts generated during a broker outage aren't buffered. Production: exponential backoff with jitter, plus a persistent outbox.

---
