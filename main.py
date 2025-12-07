import streamlit as st
import utils
import os
import streamlit.components.v1 as components
# from code_editor import code_editor

# Page Config
st.set_page_config(
    page_title="Python Syntax Explainer",
    page_icon="🐍",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Load CSS
def load_css():
    with open("style.css", encoding="utf-8") as f:
        st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)
    
    # Inject specific styles for the arrow buttons using :has() selector if supported or attribute selectors
    # Since we can't easily target by text, we'll target by the specific layout structure
    # The nav buttons are in a row with 3 columns.
    st.markdown("""
        <style>
        /* Reduce top padding */
        .block-container {
            padding-top: 2rem !important;
        }
        
        /* Target the Previous Button (First column in the nav row) */
        div[data-testid="stHorizontalBlock"] .stColumn:nth-child(1) button p:contains("←") {
             /* This doesn't work in CSS */
        }
        
        /* Valid CSS approach: Target by hierarchy */
        /* We assume the nav row is distinctive */
        
        /* Previous Button - Blue/Purple Neon */
        div[data-testid="column"] div[data-testid="stHorizontalBlock"] div[data-testid="column"]:nth-child(1) button {
            background: linear-gradient(135deg, #00c6ff, #0072ff) !important;
            border: 2px solid #00c6ff !important;
            box-shadow: 0 0 10px #00c6ff, 0 0 20px #0072ff, inset 0 0 10px rgba(0, 198, 255, 0.5) !important;
            border-radius: 15px !important;
        }
        
        /* Next Button - Pink/Red Neon */
        div[data-testid="column"] div[data-testid="stHorizontalBlock"] div[data-testid="column"]:nth-child(3) button {
            background: linear-gradient(135deg, #f857a6, #ff5858) !important;
            border: 2px solid #ff5858 !important;
            box-shadow: 0 0 10px #ff5858, 0 0 20px #f857a6, inset 0 0 10px rgba(255, 88, 88, 0.5) !important;
            border-radius: 15px !important;
        }
        
        /* Hover Effects */
        div[data-testid="column"] div[data-testid="stHorizontalBlock"] div[data-testid="column"]:nth-child(1) button:hover {
            box-shadow: 0 0 20px #00c6ff, 0 0 40px #0072ff !important;
            transform: scale(1.05);
        }
        
        div[data-testid="column"] div[data-testid="stHorizontalBlock"] div[data-testid="column"]:nth-child(3) button:hover {
            box-shadow: 0 0 20px #ff5858, 0 0 40px #f857a6 !important;
            transform: scale(1.05);
        }
        </style>
    """, unsafe_allow_html=True)

load_css()

# Initialize Session State
if "code_input" not in st.session_state:
    st.session_state.code_input = ""
if "explanation_data" not in st.session_state:
    st.session_state.explanation_data = None
if "current_step" not in st.session_state:
    st.session_state.current_step = 0
if "flowchart_code" not in st.session_state:
    st.session_state.flowchart_code = None
if "explanation" not in st.session_state:
    st.session_state.explanation = None
if "analogy_text" not in st.session_state:
    st.session_state.analogy_text = None

# Title - Hide when in debug mode (centered at top)
if not st.session_state.explanation_data:
    st.markdown("<h1 style='text-align: center;'>🐍 Python Syntax Explainer</h1>", unsafe_allow_html=True)


# Sidebar Configuration
with st.sidebar:
    st.header("Configuration")
    
    api_key = st.text_input("Google API Key", type="password", help="Enter your Gemini API Key here.")
    
    model_name = st.selectbox(
        "Model Name",
        ["gemini-pro-latest"],
        index=0
    )
    
    st.markdown("---")


# ============ KEYBOARD NAVIGATION (Hidden) ============
if st.session_state.explanation_data:
    total_steps = len(st.session_state.explanation_data)
    current_idx = st.session_state.current_step
    step_data = st.session_state.explanation_data[current_idx]
    
    # Keyboard Navigation Logic
    components.html(
        """
        <script>
        const doc = window.parent.document;
        doc.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowLeft') {
                const buttons = Array.from(doc.querySelectorAll('button'));
                const prev = buttons.find(el => el.innerText === '←');
                if (prev && !prev.disabled) {
                    prev.click();
                }
            }
            if (e.key === 'ArrowRight') {
                const buttons = Array.from(doc.querySelectorAll('button'));
                const next = buttons.find(el => el.innerText === '→');
                if (next && !next.disabled) {
                    next.click();
                }
            }
        });
        </script>
        """,
        height=0,
        width=0,
    )



# Main Layout - Conditional: 2 columns for main screen, 3 columns for debug mode
is_debug_mode = st.session_state.explanation_data is not None

if is_debug_mode:
    # Debug mode: 3 columns - Code Input | Step Navigation | Flowchart
    col1, col_nav, col2 = st.columns([4, 2, 4])
else:
    # Main screen: 2 wider columns - Code Input | Analogy
    col1, col2 = st.columns([1, 1])
    col_nav = None  # No navigation column on main screen


# Input Parsing Logic
import re
def extract_input_prompts(code):
    # Find all input() calls and extract the prompt text and variable name
    prompts = []
    lines = code.split('\n')
    for line in lines:
        if 'input(' in line:
            # Simple heuristic for variable assignment
            var_name = None
            if '=' in line:
                # Split by the FIRST '=' to handle cases like "x = input('a=b')"
                parts = line.split('=', 1)
                lhs = parts[0].strip()
                # Handle simple assignment "x ="
                if lhs.isidentifier():
                    var_name = lhs
            
            # Extract prompt text
            match = re.search(r'input\s*\((.*?)\)', line)
            prompt_text = ""
            if match:
                prompt_text = match.group(1).strip('"\'')
            
            if not var_name:
                var_name = f"Input {len(prompts) + 1}"
                
            prompts.append({
                "var_name": var_name,
                "prompt": prompt_text
            })
    return prompts

with col1:
    st.subheader("📝 Code Input")
    
    # Toggle between Edit and Debug mode
    # If explanation data exists, we are in "Debug Mode" (unless user clears)
    is_debug_mode = st.session_state.explanation_data is not None
    
    if is_debug_mode:
        # --- DEBUG MODE ---
        current_idx = st.session_state.current_step
        step_data = st.session_state.explanation_data[current_idx]
        
        line_no = step_data.get("line_no", -1)
        variables = step_data.get("variables", {})
        
        # Work on a COPY of the code to avoid modifying the original
        lines = st.session_state.code_input.split('\n')
        
        if 0 < line_no <= len(lines):
            # Add variable values as a comment if present
            if variables:
                var_annotations = []
                for k, v in variables.items():
                    var_annotations.append(f"{k}: {v}")
                var_text = ", ".join(var_annotations)
                lines[line_no - 1] = lines[line_no - 1].rstrip() + f"  # {var_text}"
            
            # Add red arrow at the beginning of the active line
            lines[line_no - 1] = "🔴 ➜ " + lines[line_no - 1]
                
        code_to_display = '\n'.join(lines)
        
        
        # Display code with st.code (has built-in syntax highlighting)

        st.code(code_to_display, language="python", line_numbers=True, height=650)
            
    else:
        # --- EDIT MODE (st_ace) ---
        from streamlit_ace import st_ace
        
        # Initialize editor version if not set
        if 'editor_version' not in st.session_state:
            st.session_state.editor_version = 0
        
        code_input = st_ace(
            value=st.session_state.code_input,
            language='python',
            theme='dracula',
            font_size=14,
            tab_size=4,
            show_gutter=True,
            show_print_margin=False,
            wrap=False,
            auto_update=True,
            readonly=False,
            key=f"code_editor_{st.session_state.editor_version}",  # Use version in key
            height=550
        )
        
        # Update session state
        st.session_state.code_input = code_input
        
        # Check for input() calls
        input_prompts = extract_input_prompts(st.session_state.code_input)
        user_inputs = {}
        
        if input_prompts:
            st.info("⌨️ This code requires input. Please provide values below:") 
            for i, item in enumerate(input_prompts):
                label = item["var_name"]
                prompt = item["prompt"]
                # Show prompt as help text or part of label if useful
                display_label = f"{label}"
                if prompt:
                    display_label += f" ({prompt})"
                    
                val = st.text_input(display_label, key=f"user_input_{i}")
                user_inputs[f"input_{i}"] = val

        btn_col1, btn_col2 = st.columns([1, 3])
        with btn_col1:
            st.markdown('<span id="button-marker-explain"></span>', unsafe_allow_html=True)
            if st.button("Explain Syntax", use_container_width=True):
                if not code_input.strip():
                    st.warning("Please enter some code first.")
                else:
                    with st.spinner("Analyzing code logic..."):
                        model = utils.configure_gemini(api_key, model_name)
                        if model:
                            input_values = list(user_inputs.values())
                            data = utils.get_explanation(model, code_input, input_values)
                            if data:
                                # Handle new dictionary format
                                if isinstance(data, dict) and "steps" in data:
                                    st.session_state.explanation = data
                                    st.session_state.explanation_data = data["steps"]
                                    st.session_state.flowchart_code = data.get("flowchart_code")
                                else:
                                    # Fallback for old format (list of steps)
                                    st.session_state.explanation_data = data
                                    st.session_state.flowchart_code = None
                                    
                                st.session_state.current_step = 0
                                st.rerun()

        with btn_col2:
            st.markdown('<span id="button-marker-clear"></span>', unsafe_allow_html=True)
            if st.button("Clear Code", use_container_width=True):
                st.session_state.code_input = ""
                st.session_state.explanation_data = None
                st.session_state.explanation = None
                st.session_state.flowchart_code = None
                st.session_state.analogy_text = None  # Clear analogy too
                st.session_state.current_step = 0
                # Force st_ace to refresh by incrementing version
                if 'editor_version' not in st.session_state:
                    st.session_state.editor_version = 0
                st.session_state.editor_version += 1
                st.session_state.editor_version += 1
                st.rerun()

        st.markdown("---")
        st.markdown('<span id="button-marker-analogy"></span>', unsafe_allow_html=True)
        if st.button("🌟 Explain with Analogy", use_container_width=True):
            if not code_input.strip():
                st.warning("Please enter some code first.")
            else:
                with st.spinner("Generating analogy..."):
                    model = utils.configure_gemini(api_key, model_name)
                    if model:
                        # Store analogy in session state to display on right side
                        analogy = utils.get_overall_explanation(model, code_input, user_inputs)
                        st.session_state.analogy_text = analogy
                        st.rerun()

# ============ CENTER COLUMN: STEP NAVIGATION (Debug mode only) ============
if col_nav is not None:
    with col_nav:
        # Add vertical spacing to center content (match code input height)
        st.markdown("<div style='height: 200px;'></div>", unsafe_allow_html=True)
        
        if st.session_state.explanation_data:
            total_steps = len(st.session_state.explanation_data)
            current_idx = st.session_state.current_step
            
            st.markdown("""
            <div style='text-align: center; margin-bottom: 15px;'>
                <h4 style='color: #888; margin: 0;'>🎯 Step Navigation</h4>
            </div>
            """, unsafe_allow_html=True)
            
            # Navigation buttons in a centered container
            btn_col1, btn_col2 = st.columns(2)
            
            with btn_col1:
                st.markdown("<span id='button-marker-prev'></span>", unsafe_allow_html=True)
                prev_clicked = st.button("← Prev", disabled=(current_idx == 0), use_container_width=True)
            
            with btn_col2:
                st.markdown("<span id='button-marker-next'></span>", unsafe_allow_html=True)
                next_clicked = st.button("Next →", disabled=(current_idx >= total_steps - 1), use_container_width=True)
            
            # Handle button clicks
            if prev_clicked and current_idx > 0:
                st.session_state.current_step = current_idx - 1
                st.rerun()
            
            if next_clicked and current_idx < total_steps - 1:
                st.session_state.current_step = current_idx + 1
                st.rerun()
            
            # Slider
            if total_steps > 1:
                selected_step = st.slider(
                    "Step",
                    min_value=1,
                    max_value=total_steps,
                    value=current_idx + 1,
                    label_visibility="collapsed"
                )
                if selected_step - 1 != current_idx:
                    st.session_state.current_step = selected_step - 1
                    st.rerun()
            
            st.markdown(f"<div style='text-align: center; color: #888; font-size: 14px; margin-top: 5px;'>Step {current_idx + 1} of {total_steps}</div>", unsafe_allow_html=True)
            
            # Add vertical spacing to push button to bottom
            st.markdown("<div style='height: 280px;'></div>", unsafe_allow_html=True)
            
            # Stop Debugging button at bottom of center column
            st.markdown("<span id='button-marker-stop'></span>", unsafe_allow_html=True)
            if st.button("Stop Debugging / Edit Code", use_container_width=True):
                st.session_state.explanation_data = None
                st.session_state.current_step = 0
                st.rerun()


with col2:

    # Hide app header in debugger mode
    if not st.session_state.explanation_data:
        # Display analogy on right side if available
        if st.session_state.analogy_text:
            st.markdown("### 🌟 Overall Explanation using Analogy")
            st.markdown(f"<div style='height: 820px; overflow: auto; padding: 15px; background-color: #1e1e1e; border-radius: 8px; border: 1px solid #333;'>{st.session_state.analogy_text}</div>", unsafe_allow_html=True)

    
    if st.session_state.explanation_data:
        current_idx = st.session_state.current_step
        step_data = st.session_state.explanation_data[current_idx]
        
        # ============ FLOWCHART CONTAINER (Mermaid.js) ============
        with st.container():
            st.markdown("### 🗺️ Flowchart")
            
            # Generate deterministic flowchart from AST
            import flowchart_generator
            import json
            
            # Get the original code and generate flowchart
            code = st.session_state.code_input
            fc_data = flowchart_generator.generate_flowchart(code)
            
            # Get current line number and variables for highlighting
            current_line = step_data.get("line_no", 0)
            current_vars = step_data.get("variables", {})
            
            # Generate Mermaid DSL with active node highlighting
            mermaid_code = flowchart_generator.flowchart_to_mermaid(
                fc_data, 
                active_line=current_line, 
                variables=current_vars
            )
            
            

            # Render with Mermaid.js
            import streamlit.components.v1 as components
            
            # Get active node ID for auto-scroll
            active_node_id = fc_data.get("line_to_node", {}).get(current_line, "")
            
            mermaid_code_js = json.dumps(mermaid_code)
            active_node_js = json.dumps(active_node_id)
            
            html_code = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
                <style>
                    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
                    html, body {{
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        overflow: hidden;
                        background-color: #1e1e1e;
                        color: white;
                        font-family: 'Inter', 'Segoe UI', sans-serif;
                    }}
                    #flowchart-container {{
                        width: 100%;
                        height: 100%;
                        border: 1px solid #444;
                        border-radius: 8px;
                        background-color: #1e1e1e;
                        position: relative;
                        overflow: scroll;
                    }}



                    #controls {{
                        position: absolute;
                        top: 10px;
                        left: 10px;
                        z-index: 100;
                        display: flex;
                        gap: 5px;
                        background: rgba(0,0,0,0.7);
                        padding: 5px;
                        border-radius: 6px;
                    }}
                    .btn {{
                        background: #2d2d2d;
                        color: #eee;
                        border: 1px solid #555;
                        width: 30px;
                        height: 30px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 16px;
                        font-weight: bold;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }}
                    .btn:hover {{
                        background: #444;
                        border-color: #777;
                        transform: scale(1.05);
                    }}
                    #mermaid-wrapper {{
                        transform-origin: top left;
                        transition: transform 0.2s ease-out;
                        padding: 20px;
                    }}
                    .mermaid {{
                        background-color: transparent;
                        font-family: 'Inter', 'Segoe UI', sans-serif;
                    }}
                    .mermaid svg {{
                        height: auto !important;
                    }}


                    /* Node sizing - larger nodes with padding */
                    .node rect, .node polygon, .node circle {{
                        rx: 5px !important;
                    }}
                    .nodeLabel {{
                        padding: 10px 15px !important;
                        font-size: 13px !important;
                        white-space: normal !important;
                        text-align: center !important;
                    }}
                    .label {{
                        font-size: 13px !important;
                    }}
                    /* Edge styling */
                    .edgePath path {{
                        stroke: #50E3C2 !important;
                        stroke-width: 2px !important;
                    }}
                    .edgeLabel {{
                        background-color: #1e1e1e !important;
                        color: #fff !important;
                        padding: 2px 6px !important;
                        font-size: 11px !important;
                    }}

                </style>
            </head>
            <body>
                <div id="controls">
                    <button class="btn" id="zoom-in-btn" title="Zoom In">+</button>
                    <button class="btn" id="zoom-out-btn" title="Zoom Out">−</button>
                    <button class="btn" id="reset-btn" title="Reset">R</button>
                </div>
                
                <div id="flowchart-container">
                    <div id="mermaid-wrapper">
                        <pre class="mermaid" id="mermaid-diagram">
{mermaid_code}
                        </pre>
                    </div>
                </div>

                <script>
                    // Initialize Mermaid with improved config
                    mermaid.initialize({{
                        startOnLoad: true,
                        theme: 'dark',
                        flowchart: {{
                            curve: 'linear',
                            padding: 10,
                            nodeSpacing: 30,
                            rankSpacing: 40,
                            htmlLabels: true,
                            useMaxWidth: false,
                            wrappingWidth: 150
                        }},


                        themeVariables: {{
                            fontFamily: 'Inter, Segoe UI, sans-serif',
                            fontSize: '13px',
                            primaryColor: '#2d2d2d',
                            primaryTextColor: '#fff',
                            primaryBorderColor: '#555',
                            lineColor: '#50E3C2',
                            secondaryColor: '#1e1e1e',
                            tertiaryColor: '#1e1e1e',
                            nodeBorder: '#555',
                            clusterBkg: '#1e1e1e'
                        }}
                    }});
                    
                    // Zoom controls - start at 1.0 for natural fit
                    let currentScale = 1.0;
                    const scaleStep = 0.1;
                    const minScale = 0.5;
                    const maxScale = 2.0;

                    

                    function updateTransform() {{
                        const wrapper = document.getElementById('mermaid-wrapper');
                        if (wrapper) {{
                            wrapper.style.transform = 'scale(' + currentScale + ')';
                        }}
                    }}
                    
                    // Apply initial scale after page loads
                    setTimeout(function() {{
                        updateTransform();
                    }}, 100);
                    
                    document.getElementById('zoom-in-btn').addEventListener('click', function() {{
                        if (currentScale < maxScale) {{
                            currentScale += scaleStep;
                            updateTransform();
                        }}
                    }});
                    
                    document.getElementById('zoom-out-btn').addEventListener('click', function() {{
                        if (currentScale > minScale) {{
                            currentScale -= scaleStep;
                            updateTransform();
                        }}
                    }});
                    
                    document.getElementById('reset-btn').addEventListener('click', function() {{
                        currentScale = 1.0;  // Reset to default 1.0x


                        updateTransform();
                        const container = document.getElementById('flowchart-container');
                        if (container) {{
                            container.scrollTop = 0;
                            container.scrollLeft = 0;
                        }}
                    }});
                    
                    // Auto-scroll to active node after render
                    const activeNodeId = {active_node_js};
                    
                    setTimeout(function() {{
                        if (activeNodeId) {{
                            // Find the active node in the SVG (Mermaid prefixes with flowchart-)
                            const activeNode = document.querySelector('[id*="' + activeNodeId + '"]');
                            if (activeNode) {{
                                activeNode.scrollIntoView({{
                                    behavior: 'smooth',
                                    block: 'center',
                                    inline: 'center'
                                }});
                            }}
                        }}
                    }}, 800);
                </script>

            </body>
            </html>
            """
            components.html(html_code, height=650)


# ============ BOTTOM SECTION: Analysis & Variables ============
if st.session_state.explanation_data:
    st.markdown("---")
    # Reduced left column width to keep Analysis to the left of center
    bottom_col1, bottom_col2 = st.columns([4, 5])
    
    # BOTTOM LEFT: Analysis
    with bottom_col1:
        current_idx = st.session_state.current_step
        step_data = st.session_state.explanation_data[current_idx]
        
        # Get the explanation text
        explanation_text = step_data.get('explanation', '')
        
        # Substitute variable values in the explanation
        variables = step_data.get('variables', {})
        if variables:
            import re
            for var_name, var_value in variables.items():
                # Replace function calls like is_prime(var) with is_prime(actual_value)
                # Pattern: function_name(variable_name) -> function_name(value)
                for other_var, other_val in variables.items():
                    explanation_text = re.sub(
                        rf'\b([a-zA-Z_][a-zA-Z0-9_]*)\({re.escape(other_var)}\)',
                        rf'\1({other_val})',
                        explanation_text
                    )
                # Replace standalone variable names (not in HTML tags) with var_name=value
                explanation_text = re.sub(
                    rf'(?<![a-zA-Z0-9_\'">]){re.escape(var_name)}(?![a-zA-Z0-9_(<=])',
                    f'{var_name}={var_value}',
                    explanation_text
                )
        
        # Fixed height with scroll
        st.markdown(f"""
        <div class='explanation-card' style='height: 300px; overflow-y: auto;'>
            <h3>💡 Analysis</h3>
            {explanation_text}
        </div>
        """, unsafe_allow_html=True)


    # BOTTOM RIGHT: Variables
    with bottom_col2:
        # Variables State - Table View
        current_idx = st.session_state.current_step # Redefine current_idx for this scope
        step_data = st.session_state.explanation_data[current_idx] # Redefine step_data for this scope
        if step_data.get("variables"):
            st.markdown("### 📊 Variables")
            
            # Get previous variables for diffing
            prev_vars = {}
            if current_idx > 0:
                prev_vars = st.session_state.explanation_data[current_idx - 1].get("variables", {})
            
            current_vars = step_data["variables"]
                        # CSS for Memory Blocks
            st.markdown("""
            <style>
            .memory-container {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                margin-top: 10px;
            }
            .memory-card {
                background-color: #1e1e1e;
                border: 1px solid #333;
                border-radius: 8px;
                padding: 12px;
                min-width: 120px;
                position: relative;
                transition: all 0.3s ease;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            .memory-card.changed {
                border-color: #FF4B2B;
                box-shadow: 0 0 15px rgba(255, 75, 43, 0.2);
                animation: pulse 1.5s infinite;
            }
            .memory-card.new {
                border-color: #00c6ff;
                box-shadow: 0 0 15px rgba(0, 198, 255, 0.2);
            }
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(255, 75, 43, 0.4); }
                70% { box-shadow: 0 0 0 10px rgba(255, 75, 43, 0); }
                100% { box-shadow: 0 0 0 0 rgba(255, 75, 43, 0); }
            }
            .var-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                border-bottom: 1px solid #333;
                padding-bottom: 4px;
            }
            .var-name {
                font-family: 'Fira Code', monospace;
                font-weight: 600;
                color: #fafafa;
                font-size: 0.9rem;
            }
            .var-type {
                font-size: 0.7rem;
                color: #888;
                background: #2d2d2d;
                padding: 2px 6px;
                border-radius: 4px;
            }
            .var-value {
                font-family: 'Fira Code', monospace;
                color: #a6e22e;
                font-size: 1rem;
                word-break: break-all;
            }
            .list-container {
                display: flex;
                gap: 4px;
                overflow-x: auto;
                padding-bottom: 4px;
            }
            .list-item {
                background: #2d2d2d;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 0.9rem;
                border: 1px solid #444;
            }
            </style>
            """, unsafe_allow_html=True)
            
            # Generate HTML for blocks
            blocks_html = '<div class="memory-container">'
            
            for var_name, var_value in current_vars.items():
                # Determine status
                status_class = ""
                if var_name not in prev_vars:
                    status_class = "new"
                elif str(prev_vars[var_name]) != str(var_value):
                    status_class = "changed"
                
                # Determine type label
                # Since we only have string representation from backend, we infer or just use generic
                # But we can try to parse simple types for display
                type_label = "variable"
                display_value = str(var_value)
                
                # Custom rendering for lists (simple heuristic)
                value_html = f'<div class="var-value">{display_value}</div>'
                if display_value.startswith('[') and display_value.endswith(']'):
                    type_label = "list"
                    try:
                        # Safe-ish parsing for display
                        import ast
                        items = ast.literal_eval(display_value)
                        if isinstance(items, list):
                            value_html = '<div class="list-container">'
                            for item in items:
                                value_html += f'<div class="list-item">{item}</div>'
                            value_html += '</div>'
                    except:
                        pass # Fallback to string
                elif display_value.startswith('{') and display_value.endswith('}'):
                    type_label = "dict"
                elif display_value.isdigit():
                    type_label = "int"
                elif display_value.replace('.', '', 1).isdigit():
                    type_label = "float"
                elif display_value.startswith("'") or display_value.startswith('"'):
                    type_label = "str"
                
                blocks_html += f"""
<div class="memory-card {status_class}">
<div class="var-header">
    <span class="var-name">{var_name}</span>
    <span class="var-type">{type_label}</span>
</div>
{value_html}
</div>
"""
            
            blocks_html += '</div>'
            st.markdown(blocks_html, unsafe_allow_html=True)
        
        # Program Output Box
        # Show only the final output (last non-empty output)
        final_output = ""
        for i in range(current_idx + 1):
            output = st.session_state.explanation_data[i].get("output", "")
            if output:
                final_output = output
        
        if final_output:
            # Filter out input prompts like "Enter an integer:"
            import re
            # Remove common input prompts
            final_output = re.sub(r'Enter[^:]*:\s*', '', final_output)
            final_output = final_output.strip()
            
            st.markdown("### 🖥️ Program Output")
            st.code(final_output, language="text")

