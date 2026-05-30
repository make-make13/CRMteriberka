import fitz

def main():
    pdf_path = r"F:\Kris\Иностранный рок\дианка\Договор_БМ6_единый_вид.pdf"
    doc = fitz.open(pdf_path)
    print("Document:", pdf_path)
    print("Total pages:", len(doc))
    
    for i, page in enumerate(doc):
        print(f"\n================ PAGE {i+1} ================")
        print(f"Size: {page.rect.width}x{page.rect.height}")
        
        # Get text blocks with coordinates
        blocks = page.get_text("blocks")
        for b in blocks:
            x0, y0, x1, y1, text, block_no, block_type = b
            text = text.strip().replace('\n', ' ')
            if text:
                print(f"Box [{x0:.1f}, {y0:.1f}, {x1:.1f}, {y1:.1f}]: {text[:100]}...")

if __name__ == '__main__':
    main()
