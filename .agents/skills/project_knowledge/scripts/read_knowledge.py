#!/usr/bin/env python3
import sys, os, json

def main():
    if len(sys.argv) != 3:
        print(json.dumps({"error": "Usage: read_knowledge.py <project> <relative_path>"}))
        sys.exit(1)
    project = sys.argv[1]
    rel_path = sys.argv[2]
    workspace_root = os.getenv('WORKSPACE_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    knowledge_path = os.path.join(workspace_root, 'knowledge', project, rel_path)
    if not os.path.isfile(knowledge_path):
        print(json.dumps({"error": f"File not found: {knowledge_path}"}))
        sys.exit(1)
    try:
        with open(knowledge_path, 'r', encoding='utf-8') as f:
            content = f.read()
        print(content)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
