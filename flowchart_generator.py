"""
Deterministic Flowchart Generator using Python AST.

This module parses Python code and generates flowchart data (nodes, edges)
with line number mapping for debugger synchronization.

Copyright 2024. MIT License.
"""

import ast
from typing import Dict, List, Tuple, Optional, Any


class FlowchartNode:
    """Represents a single node in the flowchart."""
    
    _counter = 0
    
    def __init__(self, label: str, node_type: str, line_no: int):
        FlowchartNode._counter += 1
        self.id = f"node_{FlowchartNode._counter}"
        self.label = label
        self.node_type = node_type  # operation, condition, io, subroutine, start, end
        self.line_no = line_no
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "type": self.node_type,
            "line_no": self.line_no
        }
    
    @classmethod
    def reset_counter(cls):
        cls._counter = 0


class FlowchartEdge:
    """Represents an edge between two nodes."""
    
    def __init__(self, from_node: str, to_node: str, label: str = ""):
        self.from_node = from_node
        self.to_node = to_node
        self.label = label
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "from": self.from_node,
            "to": self.to_node,
            "label": self.label
        }


class FlowchartBuilder(ast.NodeVisitor):
    """
    Walks Python AST and builds flowchart nodes/edges with line number mapping.
    """
    
    def __init__(self, source_lines: List[str]):
        self.source_lines = source_lines
        self.nodes: List[FlowchartNode] = []
        self.edges: List[FlowchartEdge] = []
        self.line_to_node: Dict[int, str] = {}
        self._last_node: Optional[FlowchartNode] = None
        self._pending_connections: List[FlowchartNode] = []
        self._no_pending: List[FlowchartNode] = []  # Pending connections with "No" label

        
        # Reset counter for each new flowchart
        FlowchartNode.reset_counter()
    
    def _get_source_line(self, lineno: int) -> str:
        """Get the source code for a given line number."""
        if 1 <= lineno <= len(self.source_lines):
            return self.source_lines[lineno - 1].strip()
        return ""
    
    def _add_node(self, label: str, node_type: str, line_no: int) -> FlowchartNode:
        """Add a new node to the flowchart."""
        node = FlowchartNode(label, node_type, line_no)
        self.nodes.append(node)
        
        # Map line number to node ID
        if line_no not in self.line_to_node:
            self.line_to_node[line_no] = node.id
        
        return node
    
    def _connect(self, from_node: FlowchartNode, to_node: FlowchartNode, label: str = ""):
        """Connect two nodes with an edge."""
        if from_node and to_node:
            edge = FlowchartEdge(from_node.id, to_node.id, label)
            self.edges.append(edge)
    
    def _connect_pending(self, to_node: FlowchartNode):
        """Connect all pending nodes to the given node."""
        for pending in self._pending_connections:
            self._connect(pending, to_node)
        self._pending_connections = []
        
        # Connect "No" pending connections with "No" label
        for pending in self._no_pending:
            self._connect(pending, to_node, "No")
        self._no_pending = []

    
    def build(self, tree: ast.AST) -> Dict[str, Any]:
        """Build the flowchart from an AST tree."""
        # Add start node
        start_node = self._add_node("Start", "start", 0)
        self._last_node = start_node
        
        # Visit all statements
        if isinstance(tree, ast.Module):
            for stmt in tree.body:
                self.visit(stmt)
        else:
            self.visit(tree)
        
        # Add end node
        end_node = self._add_node("End", "end", 0)
        if self._last_node:
            self._connect(self._last_node, end_node)
        self._connect_pending(end_node)
        
        return {
            "nodes": [n.to_dict() for n in self.nodes],
            "edges": [e.to_dict() for e in self.edges],
            "line_to_node": self.line_to_node
        }
    
    def visit_Assign(self, node: ast.Assign):
        """Handle assignment statements."""
        line_no = node.lineno
        label = self._get_source_line(line_no)
        fc_node = self._add_node(label, "operation", line_no)
        
        if self._last_node:
            self._connect(self._last_node, fc_node)
        self._connect_pending(fc_node)
        self._last_node = fc_node
    
    def visit_AugAssign(self, node: ast.AugAssign):
        """Handle augmented assignment (+=, -=, etc.)."""
        line_no = node.lineno
        label = self._get_source_line(line_no)
        fc_node = self._add_node(label, "operation", line_no)
        
        if self._last_node:
            self._connect(self._last_node, fc_node)
        self._connect_pending(fc_node)
        self._last_node = fc_node
    
    def visit_Expr(self, node: ast.Expr):
        """Handle expression statements (like print calls). Skip docstrings."""
        # Skip docstrings (standalone string literals)
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            return  # Skip docstrings
        
        line_no = node.lineno
        label = self._get_source_line(line_no)
        
        # Determine if it's an I/O operation
        node_type = "operation"
        if isinstance(node.value, ast.Call):
            if isinstance(node.value.func, ast.Name):
                if node.value.func.id in ("print", "input"):
                    node_type = "io"
        
        fc_node = self._add_node(label, node_type, line_no)

        
        if self._last_node:
            self._connect(self._last_node, fc_node)
        self._connect_pending(fc_node)
        self._last_node = fc_node
    
    def visit_If(self, node: ast.If):
        """Handle if/elif/else statements."""
        line_no = node.lineno
        # Get just the condition part
        label = self._get_source_line(line_no).rstrip(":")
        
        cond_node = self._add_node(label, "condition", line_no)
        
        if self._last_node:
            self._connect(self._last_node, cond_node)
        self._connect_pending(cond_node)
        
        # Process 'if' body (Yes branch)
        self._last_node = None  # Reset to track first body node
        body_end_nodes = []
        first_body_node = None
        
        for stmt in node.body:
            self.visit(stmt)
            if first_body_node is None and self._last_node:
                first_body_node = self._last_node
        
        # Connect condition to first body node with "Yes" label
        if first_body_node:
            self._connect(cond_node, first_body_node, "Yes")
        
        if self._last_node and self._last_node != cond_node:
            body_end_nodes.append(self._last_node)
        body_end_nodes.extend(self._pending_connections)
        self._pending_connections = []
        
        # Process 'else' body (No branch)
        self._last_node = None  # Reset to track first else node
        else_end_nodes = []
        first_else_node = None
        
        if node.orelse:
            for stmt in node.orelse:
                self.visit(stmt)
                if first_else_node is None and self._last_node:
                    first_else_node = self._last_node
            
            # Connect condition to first else node with "No" label
            if first_else_node:
                self._connect(cond_node, first_else_node, "No")
            
            if self._last_node and self._last_node != cond_node:
                else_end_nodes.append(self._last_node)
            else_end_nodes.extend(self._pending_connections)
            self._pending_connections = []
        else:
            # No else branch - add pending connection with "No" label
            self._no_pending.append(cond_node)
        
        # All branches converge
        self._pending_connections = body_end_nodes + else_end_nodes
        self._last_node = None


    
    def visit_For(self, node: ast.For):
        """Handle for loops."""
        line_no = node.lineno
        label = self._get_source_line(line_no).rstrip(":")
        
        # Use operation type for rectangle shape
        loop_node = self._add_node(label, "operation", line_no)
        
        if self._last_node:
            self._connect(self._last_node, loop_node)
        self._connect_pending(loop_node)
        
        # Process loop body
        self._last_node = loop_node
        
        for stmt in node.body:
            self.visit(stmt)
        
        # Loop back to condition
        if self._last_node and self._last_node != loop_node:
            self._connect(self._last_node, loop_node, "loop")
        
        # After loop exits, continue from loop node in main flow
        self._last_node = loop_node
    
    def visit_While(self, node: ast.While):
        """Handle while loops."""
        line_no = node.lineno
        label = self._get_source_line(line_no).rstrip(":")
        
        # Use operation type for rectangle shape
        loop_node = self._add_node(label, "operation", line_no)
        
        if self._last_node:
            self._connect(self._last_node, loop_node)
        self._connect_pending(loop_node)
        
        # Process loop body
        self._last_node = loop_node
        
        for stmt in node.body:
            self.visit(stmt)
        
        # Loop back to condition
        if self._last_node and self._last_node != loop_node:
            self._connect(self._last_node, loop_node, "loop")
        
        # After loop exits, continue from loop node in main flow
        self._last_node = loop_node

    
    def visit_FunctionDef(self, node: ast.FunctionDef):
        """Handle function definitions - process body in unified flow."""
        line_no = node.lineno
        # Get full function signature with parameters
        args = [arg.arg for arg in node.args.args]
        args_str = ", ".join(args)
        label = f"def {node.name}({args_str})"

        
        func_node = self._add_node(label, "subroutine", line_no)
        
        if self._last_node:
            self._connect(self._last_node, func_node)
        self._connect_pending(func_node)
        
        # Process function body in the unified flow
        self._last_node = func_node
        for stmt in node.body:
            self.visit(stmt)
        
        # After function body, if _last_node is None (due to return), 
        # set it to func_node so the flow continues to next statement
        if self._last_node is None:
            self._last_node = func_node


    
    def visit_Return(self, node: ast.Return):
        """Handle return statements."""
        line_no = node.lineno
        label = self._get_source_line(line_no)
        
        # Use operation type (rectangle) instead of end (stadium) so it fits in flow
        ret_node = self._add_node(label, "operation", line_no)
        
        if self._last_node:
            self._connect(self._last_node, ret_node)
        self._connect_pending(ret_node)
        
        # Keep return node as last node so flow continues
        self._last_node = ret_node

    
    def visit_Try(self, node: ast.Try):
        """Handle try/except/else/finally blocks."""
        line_no = node.lineno
        label = "try"
        
        try_node = self._add_node(label, "condition", line_no)
        
        if self._last_node:
            self._connect(self._last_node, try_node)
        self._connect_pending(try_node)
        
        # Process try body
        self._last_node = try_node
        branch_ends = []
        
        for stmt in node.body:
            self.visit(stmt)
        
        if self._last_node and self._last_node != try_node:
            branch_ends.append(self._last_node)
        branch_ends.extend(self._pending_connections)
        self._pending_connections = []
        
        # Process except handlers
        for handler in node.handlers:
            handler_label = f"except {handler.type.id if handler.type else ''}"
            handler_node = self._add_node(handler_label, "condition", handler.lineno)
            self._connect(try_node, handler_node, "except")
            
            self._last_node = handler_node
            for stmt in handler.body:
                self.visit(stmt)
            
            if self._last_node and self._last_node != handler_node:
                branch_ends.append(self._last_node)
            branch_ends.extend(self._pending_connections)
            self._pending_connections = []
        
        # Process else (runs if no exception)
        if node.orelse:
            else_start = None
            for stmt in node.orelse:
                if else_start is None:
                    self._last_node = branch_ends[0] if branch_ends else try_node
                self.visit(stmt)
                if else_start is None:
                    else_start = self._last_node
            
            if self._last_node:
                branch_ends.append(self._last_node)
        
        self._pending_connections = branch_ends
        self._last_node = None
    
    def generic_visit(self, node: ast.AST):
        """Fallback for unhandled node types."""
        # For statements with line numbers, create a generic operation node
        if hasattr(node, 'lineno') and isinstance(node, ast.stmt):
            line_no = node.lineno
            label = self._get_source_line(line_no)
            fc_node = self._add_node(label, "operation", line_no)
            
            if self._last_node:
                self._connect(self._last_node, fc_node)
            self._connect_pending(fc_node)
            self._last_node = fc_node
        
        # Continue visiting children
        super().generic_visit(node)


def generate_flowchart(code: str) -> Dict[str, Any]:
    """
    Generate flowchart data from Python code.
    
    Args:
        code: Python source code as a string.
    
    Returns:
        Dictionary with 'nodes', 'edges', and 'line_to_node' mapping.
    """
    try:
        tree = ast.parse(code)
        source_lines = code.split('\n')
        builder = FlowchartBuilder(source_lines)
        return builder.build(tree)
    except SyntaxError as e:
        return {
            "nodes": [{"id": "error", "label": f"Syntax Error: {e.msg}", "type": "end", "line_no": e.lineno or 0}],
            "edges": [],
            "line_to_node": {}
        }


def flowchart_to_mermaid(flowchart_data: Dict[str, Any], active_line: int = 0, variables: Dict[str, Any] = None) -> str:
    """
    Convert flowchart data to Mermaid.js DSL.
    
    Args:
        flowchart_data: Output from generate_flowchart().
        active_line: Current line number to highlight.
        variables: Current variable states to inject into labels.
    
    Returns:
        Mermaid.js diagram definition string.
    """
    if variables is None:
        variables = {}
    
    lines = [
        "%%{init: {'flowchart': {'curve': 'linear', 'htmlLabels': true}}}%%",
        "flowchart TD"
    ]
    
    # Shape mapping
    shape_map = {
        "start": ('([', '])'),       # Stadium shape
        "end": ('([', '])'),         # Stadium shape
        "operation": ('[', ']'),      # Rectangle
        "condition": ('{', '}'),      # Diamond
        "io": ('[/', '/]'),           # Parallelogram
        "subroutine": ('[[', ']]'),   # Subroutine
    }
    
    # Ensure active_line is int for comparison
    active_line = int(active_line) if active_line else 0
    active_node_id = flowchart_data.get("line_to_node", {}).get(active_line)
    
    lines.append("")
    
    # Generate node definitions (without class suffix - will use inline style)
    for node in flowchart_data.get("nodes", []):
        node_id = node["id"]
        label = node["label"]
        node_type = node.get("type", "operation")
        
        # Inject variable values into the label if this is the active node
        if node_id == active_node_id and variables:
            import re
            # Substitute variable names with their values in the label
            for var_name, var_value in variables.items():
                # Special case: Replace input() assignments with the value
                # e.g., "user_input = int(input('...'))" -> "user_input = 6"
                input_pattern = rf'{re.escape(var_name)}\s*=\s*(?:int|float|str)?\s*\(?\s*input\s*\([^)]*\)\s*\)?'
                if re.search(input_pattern, label):
                    label = re.sub(input_pattern, f'{var_name} = {var_value}', label)
                    continue  # Skip further replacement for this variable
                
                # Replace f-string style {var_name} with value
                label = label.replace(f"{{{var_name}}}", str(var_value))
                
                # For assignments like "x = something", only replace on the right side
                # Check if this is an assignment of this variable
                assign_pattern = rf'^{re.escape(var_name)}\s*='
                if re.match(assign_pattern, label.strip()):
                    # This is an assignment TO this variable, don't replace the LHS
                    # Only replace after the '='
                    parts = label.split('=', 1)
                    if len(parts) == 2:
                        rhs = parts[1]
                        pattern = rf'\b{re.escape(var_name)}\b'
                        rhs = re.sub(pattern, str(var_value), rhs)
                        label = parts[0] + '=' + rhs
                else:
                    # Not an assignment, replace all occurrences
                    pattern = rf'\b{re.escape(var_name)}\b'
                    label = re.sub(pattern, str(var_value), label)

            
            # After substitution, remove f-string prefix if no more {variables} remain
            if "f'" in label and "{" not in label:
                label = label.replace("f'", "'")
            if 'f"' in label and "{" not in label:
                label = label.replace('f"', '"')





        
        # Escape special characters in label
        label = label.replace('"', "'").replace('<', '&lt;').replace('>', '&gt;')
        # But keep <br/> for line breaks
        label = label.replace('&lt;br/&gt;', '<br/>')
        
        # Get shape brackets
        left, right = shape_map.get(node_type, ('[', ']'))
        
        # Define node without class (will style with inline style statements)
        lines.append(f'    {node_id}{left}"{label}"{right}')
    
    # Generate edges
    lines.append("")
    for edge in flowchart_data.get("edges", []):
        from_id = edge["from"]
        to_id = edge["to"]
        label = edge.get("label", "")
        
        if label:
            lines.append(f'    {from_id} -->|{label}| {to_id}')
        else:
            lines.append(f'    {from_id} --> {to_id}')
    
    # Apply inline styles at the end (this is MORE RELIABLE than classDef in dark theme)
    lines.append("")
    lines.append("    %% Inline styles")
    
    # Style all nodes with uniform gray (neutral)
    for node in flowchart_data.get("nodes", []):
        node_id = node["id"]
        # All nodes get the same neutral gray style
        lines.append(f'    style {node_id} fill:#3a3a3a,stroke:#666,color:#fff')
    
    # Override active node with red highlight (LAST so it takes precedence)
    if active_node_id:
        lines.append(f'    style {active_node_id} fill:#00c6ff,stroke:#0072ff,color:#000,stroke-width:4px')
    
    return "\n".join(lines)




# Test the module
if __name__ == "__main__":
    test_code = """
x = 1
if x > 0:
    print("positive")
else:
    print("not positive")
print("done")
"""
    
    fc_data = generate_flowchart(test_code)
    print("Flowchart Data:")
    print(fc_data)
    print("\nMermaid DSL:")
    print(flowchart_to_mermaid(fc_data, active_line=3))
