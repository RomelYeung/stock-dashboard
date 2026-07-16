import re

with open('public/release-notes.html', 'r') as f:
    content = f.read()

new_entry = """
        <article class="release-entry">
          <div class="entry-meta">
            <time datetime="2026-06-13">June 13, 2026</time>
            <span class="tag tag-fix">Fix</span>
          </div>
          <h3>Fix AI Financial Adviser chat window text selection and unmounting errors</h3>
          <p>Resolved an issue where text selection inside the floating AI Financial Adviser chat window would inadvertently drag the window. The chat window now correctly restricts dragging to the header handle. Additionally, fixed memory leaks and state update errors that occurred when closing the chat window while the AI was still streaming its response.</p>
        </article>
"""

content = content.replace('<h2>June 2026</h2>', '<h2>June 2026</h2>' + new_entry)

with open('public/release-notes.html', 'w') as f:
    f.write(content)

print("Release notes updated.")
