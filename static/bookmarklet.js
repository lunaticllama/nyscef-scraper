(function () {
    'use strict';

    // Toggle off if already open
    var existing = document.getElementById('nyscef-bm-overlay');
    if (existing) { existing.remove(); return; }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function esc(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Case title ───────────────────────────────────────────────────────────

    function getCaseTitle() {
        // NYSCEF renders the case number as bold text at the top of the content area
        // e.g. "519386/2025 - Kings County Supreme Court"
        var bolds = document.querySelectorAll('b');
        for (var i = 0; i < bolds.length; i++) {
            var t = bolds[i].textContent.trim();
            if (/\d+[\/\-]\d+/.test(t) && t.length < 120) return t;
        }
        return document.title;
    }

    // ── Find document table ───────────────────────────────────────────────────

    function findDocTable() {
        var tables = document.querySelectorAll('table');
        for (var i = 0; i < tables.length; i++) {
            var t = tables[i];
            var firstRow = t.querySelector('tr');
            if (!firstRow) continue;
            var txt = firstRow.textContent;
            if (txt.indexOf('Document') !== -1 && txt.indexOf('Filed By') !== -1 && txt.indexOf('Status') !== -1) {
                return t;
            }
        }
        return null;
    }

    // ── Parse rows ───────────────────────────────────────────────────────────

    function parseDocs(table) {
        var rows = table.querySelectorAll('tr');
        var docs = [];

        for (var i = 0; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll('td');
            if (cells.length < 3) continue;

            // Skip header row
            var firstText = cells[0].textContent.trim();
            if (firstText === '#' || firstText === '') continue;
            if (isNaN(parseInt(firstText))) continue;

            var num = firstText;

            // Document name (linked) + italic subtitle
            var docLink = cells[1].querySelector('a');
            var docName = docLink ? docLink.textContent.trim() : cells[1].textContent.split('\n')[0].trim();
            var italicEl = cells[1].querySelector('i, em');
            var subtitle = italicEl ? italicEl.textContent.trim() : '';

            // Filed By (linked name) + "Filed: MM/DD/YYYY"
            var filedByLink = cells[2].querySelector('a');
            var filedBy = filedByLink ? filedByLink.textContent.trim() : cells[2].textContent.trim().split('\n')[0].trim();
            var cell2Text = cells[2].textContent;
            var dateMatch = cell2Text.match(/Filed:\s*(\d{2}\/\d{2}\/\d{4})/);
            var filedDate = dateMatch ? dateMatch[1] : '';

            // Status — first text content before any links
            var status = '';
            if (cells[3]) {
                var statusNode = cells[3].firstChild;
                while (statusNode) {
                    var s = statusNode.textContent.trim();
                    if (s) { status = s; break; }
                    statusNode = statusNode.nextSibling;
                }
            }

            docs.push({ num: num, docName: docName, subtitle: subtitle, filedBy: filedBy, filedDate: filedDate, status: status });
        }
        return docs;
    }

    // ── Build overlay ─────────────────────────────────────────────────────────

    function buildOverlay(caseTitle, docs) {
        var overlay = document.createElement('div');
        overlay.id = 'nyscef-bm-overlay';
        overlay.style.cssText = [
            'position:fixed', 'top:16px', 'right:16px', 'width:700px', 'max-height:88vh',
            'background:#fff', 'border:1px solid #bbb', 'border-radius:8px',
            'box-shadow:0 6px 28px rgba(0,0,0,0.22)', 'z-index:2147483647',
            'display:flex', 'flex-direction:column',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'font-size:13px', 'color:#1a1a1a'
        ].join(';');

        // Header
        var hdr = document.createElement('div');
        hdr.style.cssText = 'background:#1a3a5c;color:#fff;padding:11px 14px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;gap:10px;';

        var titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;';
        titleEl.textContent = caseTitle;

        var btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

        var csvBtn = makeBtn('Copy CSV', '#2d6a9f');
        var closeBtn = makeBtn('✕', 'transparent');
        closeBtn.style.border = '1px solid rgba(255,255,255,0.35)';
        closeBtn.onclick = function () { overlay.remove(); };

        btnWrap.appendChild(csvBtn);
        btnWrap.appendChild(closeBtn);
        hdr.appendChild(titleEl);
        hdr.appendChild(btnWrap);
        overlay.appendChild(hdr);

        // Sub-header
        var sub = document.createElement('div');
        sub.style.cssText = 'padding:6px 14px;background:#eef2f7;color:#555;font-size:11.5px;border-bottom:1px solid #ddd;flex-shrink:0;';
        sub.textContent = docs.length + ' document' + (docs.length !== 1 ? 's' : '');
        overlay.appendChild(sub);

        // Table
        var wrap = document.createElement('div');
        wrap.style.cssText = 'overflow:auto;flex:1;';

        var tbl = document.createElement('table');
        tbl.style.cssText = 'width:100%;border-collapse:collapse;';

        var thead = document.createElement('thead');
        var hrow = document.createElement('tr');
        var cols = ['#', 'Document', 'Filed By', 'Date Filed', 'Status'];
        cols.forEach(function (col, ci) {
            var th = document.createElement('th');
            th.textContent = col + ' ⇅';
            th.style.cssText = 'background:#eef2f7;padding:7px 10px;text-align:left;border-bottom:2px solid #ccc;white-space:nowrap;position:sticky;top:0;cursor:pointer;user-select:none;font-size:12px;';
            th.onclick = function () { sortBy(ci); };
            hrow.appendChild(th);
        });
        thead.appendChild(hrow);
        tbl.appendChild(thead);

        var tbody = document.createElement('tbody');
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
        overlay.appendChild(wrap);

        // Sort state
        var sortDir = {};
        var current = docs.slice();

        function renderRows() {
            tbody.innerHTML = '';
            current.forEach(function (d, idx) {
                var tr = document.createElement('tr');
                tr.style.background = idx % 2 === 0 ? '#fff' : '#f8fafc';

                // # cell
                appendCell(tr, d.num, 'width:28px;text-align:center;color:#666;');

                // Document cell
                var td2 = document.createElement('td');
                td2.style.cssText = 'padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;';
                td2.innerHTML = '<span style="font-weight:500">' + esc(d.docName) + '</span>' +
                    (d.subtitle ? '<br><span style="color:#666;font-size:11px;font-style:italic">' + esc(d.subtitle) + '</span>' : '');
                tr.appendChild(td2);

                appendCell(tr, d.filedBy, '');
                appendCell(tr, d.filedDate, 'white-space:nowrap;');

                // Status cell
                var td5 = document.createElement('td');
                td5.style.cssText = 'padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap;';
                var isProcessed = d.status.toLowerCase().indexOf('process') !== -1;
                td5.innerHTML = '<span style="' + (isProcessed ? 'color:#2a7a2a;font-weight:600;' : '') + '">' + esc(d.status) + '</span>';
                tr.appendChild(td5);

                tbody.appendChild(tr);
            });
        }

        function appendCell(tr, text, extraStyle) {
            var td = document.createElement('td');
            td.style.cssText = 'padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;' + extraStyle;
            td.textContent = text;
            tr.appendChild(td);
        }

        function sortBy(ci) {
            var keys = ['num', 'docName', 'filedBy', 'filedDate', 'status'];
            var key = keys[ci];
            var asc = !sortDir[ci];
            sortDir = {};
            sortDir[ci] = asc;
            current.sort(function (a, b) {
                var av = ci === 0 ? parseInt(a[key]) || 0 : (a[key] || '');
                var bv = ci === 0 ? parseInt(b[key]) || 0 : (b[key] || '');
                if (av < bv) return asc ? -1 : 1;
                if (av > bv) return asc ? 1 : -1;
                return 0;
            });
            renderRows();
        }

        renderRows();

        // CSV copy
        csvBtn.onclick = function () {
            var lines = ['"#","Document","Subtitle","Filed By","Date Filed","Status"'];
            docs.forEach(function (d) {
                lines.push([d.num, d.docName, d.subtitle, d.filedBy, d.filedDate, d.status].map(function (v) {
                    return '"' + (v || '').replace(/"/g, '""') + '"';
                }).join(','));
            });
            navigator.clipboard.writeText(lines.join('\n')).then(function () {
                csvBtn.textContent = 'Copied!';
                setTimeout(function () { csvBtn.textContent = 'Copy CSV'; }, 2000);
            });
        };

        return overlay;
    }

    function makeBtn(label, bg) {
        var b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'background:' + bg + ';color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;';
        return b;
    }

    // ── Main ──────────────────────────────────────────────────────────────────

    var table = findDocTable();
    if (!table) {
        alert('NYSCEF Scraper: No document list found.\n\nMake sure you are on a case page with the "Document List" tab selected.');
        return;
    }

    var docs = parseDocs(table);
    if (docs.length === 0) {
        alert('NYSCEF Scraper: Found the document table but could not read any rows.\nThe page structure may have changed — please report this.');
        return;
    }

    var overlay = buildOverlay(getCaseTitle(), docs);
    document.body.appendChild(overlay);

})();
