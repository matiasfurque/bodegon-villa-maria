from pathlib import Path
from zipfile import ZipFile
import re
import sys
import xml.etree.ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def text_from_node(node):
    parts = []
    for elem in node.iter():
        if elem.tag == f"{{{NS['w']}}}t":
            parts.append(elem.text or "")
        elif elem.tag == f"{{{NS['w']}}}tab":
            parts.append("\t")
        elif elem.tag == f"{{{NS['w']}}}br":
            parts.append("\n")
    return "".join(parts).strip()


def extract(path):
    with ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines = []
    for child in root.findall(".//w:body/*", NS):
        if child.tag == f"{{{NS['w']}}}p":
            text = text_from_node(child)
            if text:
                lines.append(text)
        elif child.tag == f"{{{NS['w']}}}tbl":
            for row in child.findall(".//w:tr", NS):
                cells = [text_from_node(cell) for cell in row.findall("./w:tc", NS)]
                cells = [re.sub(r"\s+", " ", c).strip() for c in cells if c.strip()]
                if cells:
                    lines.append(" | ".join(cells))
    return "\n".join(lines)


if __name__ == "__main__":
    for name in sys.argv[1:]:
        path = Path(name)
        print(f"\n===== {path.name} =====")
        print(extract(path))
