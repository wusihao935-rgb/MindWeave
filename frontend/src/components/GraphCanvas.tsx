import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntityNode, RelationEdge } from "../types";

interface GraphCanvasProps {
  nodes: EntityNode[];
  edges: RelationEdge[];
  selectedNodeId?: string;
  onSelectNode: (nodeId: string) => void;
}

interface SimNode extends EntityNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimEdge {
  source: string | SimNode;
  target: string | SimNode;
  relationType: string;
  evidence: string;
}

export function GraphCanvas({ nodes, edges, selectedNodeId, onSelectNode }: GraphCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ width: 820, height: 560 });

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(420, entry.contentRect.width),
        height: Math.max(360, entry.contentRect.height)
      });
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const graph = useMemo(
    () => ({
      nodes: nodes.map((node) => ({ ...node })) as SimNode[],
      edges: edges.map((edge) => ({
        source: edge.sourceNode,
        target: edge.targetNode,
        relationType: edge.relationType,
        evidence: edge.evidence
      })) as SimEdge[]
    }),
    [nodes, edges]
  );

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const zoomLayer = svg.append("g").attr("class", "zoom-layer");
    const linkLayer = zoomLayer.append("g").attr("class", "links");
    const nodeLayer = zoomLayer.append("g").attr("class", "nodes");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.2])
      .on("zoom", (event) => zoomLayer.attr("transform", event.transform.toString()));
    svg.call(zoom as any);

    const simulation = d3
      .forceSimulation(graph.nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, any>(graph.edges)
          .id((node) => node.id)
          .distance((edge) => (edge.relationType === "提及" ? 100 : 132))
          .strength(0.55)
      )
      .force("charge", d3.forceManyBody().strength(-460))
      .force("center", d3.forceCenter(size.width / 2, size.height / 2))
      .force("collision", d3.forceCollide().radius((node: any) => (node.nodeType === "source" ? 56 : 42)));

    const links = linkLayer
      .selectAll("line")
      .data(graph.edges)
      .enter()
      .append("line")
      .attr("stroke-width", 1.3)
      .attr("stroke", (edge) => relationColor(edge.relationType))
      .attr("stroke-opacity", 0.48);

    const edgeLabels = linkLayer
      .selectAll("text")
      .data(graph.edges.slice(0, 18))
      .enter()
      .append("text")
      .attr("class", "edge-label")
      .text((edge) => edge.relationType);

    const nodeGroups = nodeLayer
      .selectAll("g")
      .data(graph.nodes)
      .enter()
      .append("g")
      .attr("class", (node) => `graph-node ${node.status} ${node.origin} ${node.id === selectedNodeId ? "selected" : ""}`)
      .style("cursor", "pointer")
      .on("click", (_event, node) => onSelectNode(node.id))
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (event, node) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            node.fx = node.x;
            node.fy = node.y;
          })
          .on("drag", (event, node) => {
            node.fx = event.x;
            node.fy = event.y;
          })
          .on("end", (event, node) => {
            if (!event.active) simulation.alphaTarget(0);
            node.fx = null;
            node.fy = null;
          })
      );

    nodeGroups
      .append("circle")
      .attr("r", (node) => (node.nodeType === "source" ? 24 : 18))
      .attr("fill", (node) => nodeColor(node.nodeType))
      .attr("stroke", (node) => nodeStroke(node, selectedNodeId))
      .attr("stroke-dasharray", (node) => (node.status === "pending" ? "4 3" : "0"))
      .attr("stroke-width", (node) => (node.id === selectedNodeId ? 3.5 : node.userEdited ? 3 : 2));

    nodeGroups
      .append("text")
      .attr("class", "node-label")
      .attr("dy", (node) => (node.nodeType === "source" ? 40 : 32))
      .text((node) => compactLabel(node.name, node.nodeType === "source" ? 12 : 10));

    nodeGroups
      .append("title")
      .text((node) => `${node.name}\n${node.description}\n置信度：${Math.round(node.confidence * 100)}%\n状态：${node.status}`);

    simulation.on("tick", () => {
      links
        .attr("x1", (edge: any) => edge.source.x)
        .attr("y1", (edge: any) => edge.source.y)
        .attr("x2", (edge: any) => edge.target.x)
        .attr("y2", (edge: any) => edge.target.y);

      edgeLabels
        .attr("x", (edge: any) => (edge.source.x + edge.target.x) / 2)
        .attr("y", (edge: any) => (edge.source.y + edge.target.y) / 2);

      nodeGroups.attr("transform", (node) => `translate(${node.x},${node.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graph, onSelectNode, selectedNodeId, size.height, size.width]);

  return (
    <div className="graph-shell" ref={wrapperRef}>
      <div className="graph-toolbar">
        <div>
          <strong>个人知识图谱</strong>
          <span>
            {nodes.length} nodes / {edges.length} links · {nodes.filter((node) => node.status === "pending").length} 待审核
          </span>
        </div>
        <div className="legend">
          <span><i className="legend-source" />资料</span>
          <span><i className="legend-concept" />概念</span>
          <span><i className="legend-method" />方法</span>
          <span><i className="legend-pending" />待审核</span>
        </div>
      </div>
      <svg ref={svgRef} width={size.width} height={size.height} role="img" aria-label="MindWeave 知识图谱" />
    </div>
  );
}

function nodeStroke(node: EntityNode, selectedNodeId?: string) {
  if (node.id === selectedNodeId) return "#111827";
  if (node.userEdited || node.origin === "user_created" || node.status === "confirmed") return "#16a34a";
  if (node.status === "pending" || node.confidence < 0.72) return "#d97706";
  return "#ffffff";
}

function compactLabel(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1)}...` : label;
}

function nodeColor(type: string) {
  if (type === "source") return "#4f83ff";
  if (type === "method") return "#35c2a2";
  if (type === "organization") return "#d99a46";
  if (type === "viewpoint") return "#d96b8b";
  return "#8d7aff";
}

function relationColor(type: string) {
  if (type === "提及") return "#67748d";
  if (type === "对比" || type === "反驳") return "#d96b8b";
  if (type === "解释") return "#4f83ff";
  return "#35c2a2";
}
