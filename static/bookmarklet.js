(function () {
    'use strict';

    // Toggle off if already open
    var existing = document.getElementById('nyscef-bm-overlay');
    if (existing) { existing.remove(); return; }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function esc(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Case info ─────────────────────────────────────────────────────────────

    function getCaseInfo() {
        var indexNo = '';
        var bolds = document.querySelectorAll('b');
        for (var i = 0; i < bolds.length; i++) {
            var m = bolds[i].textContent.trim().match(/^(\d+[\/\-]\d+)/);
            if (m) { indexNo = m[1]; break; }
        }
        var caption = '';
        var cm = (document.body.innerText || '').match(/Short Caption:\s*([^\n]+)/i);
        if (cm) caption = cm[1].trim();
        return { indexNo: indexNo, caption: caption };
    }

    // ── Find document table (works on any Document object) ────────────────────

    function findDocTable(doc) {
        doc = doc || document;
        var tables = doc.querySelectorAll('table');
        for (var i = 0; i < tables.length; i++) {
            var firstRow = tables[i].querySelector('tr');
            if (!firstRow) continue;
            var txt = firstRow.textContent;
            if (txt.indexOf('Document') !== -1 && txt.indexOf('Filed By') !== -1 && txt.indexOf('Status') !== -1) {
                return tables[i];
            }
        }
        return null;
    }

    // ── Parse document rows ───────────────────────────────────────────────────

    function parseDocs(table) {
        var rows = table.querySelectorAll('tr');
        var docs = [];
        for (var i = 0; i < rows.length; i++) {
            var cells = rows[i].querySelectorAll('td');
            if (cells.length < 3) continue;
            var firstText = cells[0].textContent.trim();
            if (firstText === '#' || firstText === '' || isNaN(parseInt(firstText))) continue;

            var docLink = cells[1].querySelector('a');
            var docName = docLink ? docLink.textContent.trim() : cells[1].textContent.split('\n')[0].trim();
            var italicEl = cells[1].querySelector('i, em');
            var subtitle = italicEl ? italicEl.textContent.trim() : '';

            var filedByLink = cells[2].querySelector('a');
            var filedBy = filedByLink ? filedByLink.textContent.trim() : cells[2].textContent.trim().split('\n')[0].trim();
            var dateMatch = cells[2].textContent.match(/Filed:\s*(\d{2}\/\d{2}\/\d{4})/);
            var filedDate = dateMatch ? dateMatch[1] : '';

            var status = '';
            if (cells[3]) {
                var sn = cells[3].firstChild;
                while (sn) { var st = sn.textContent.trim(); if (st) { status = st; break; } sn = sn.nextSibling; }
            }

            docs.push({ num: firstText, docName: docName, subtitle: subtitle, filedBy: filedBy, filedDate: filedDate, status: status });
        }
        return docs;
    }

    // ── Pagination: find URLs for pages 2…N ───────────────────────────────────

    function getExtraPageUrls() {
        // Find the pagination container by locating any text node containing "Page:"
        // then walking up until we find an ancestor that also contains page links.
        var paginEl = null;
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue.indexOf('Page:') !== -1) {
                // Walk up from the text node until we find an ancestor with numbered links
                var el = node.parentElement;
                while (el && el !== document.body) {
                    var links = el.querySelectorAll('a');
                    for (var li = 0; li < links.length; li++) {
                        if (/^\d+$/.test(links[li].textContent.trim())) { paginEl = el; break; }
                    }
                    if (paginEl) break;
                    el = el.parentElement;
                }
                if (paginEl) break;
            }
        }

        console.log('[NYSCEF Scraper] Pagination container:', paginEl);
        if (!paginEl) return [];

        var allLinks = Array.from(paginEl.querySelectorAll('a'));
        console.log('[NYSCEF Scraper] Pagination links:', allLinks.map(function(a){ return a.textContent.trim() + ' → ' + a.href; }));
        if (allLinks.length === 0) return [];

        var lastLink    = allLinks.find(function (a) { return a.textContent.trim().toLowerCase() === 'last'; });
        var numberedLinks = allLinks.filter(function (a) { return /^\d+$/.test(a.textContent.trim()); });
        if (numberedLinks.length === 0) return [];

        // Detect the page-number URL parameter from the first numbered link
        var refUrl   = numberedLinks[0].href;
        var refPage  = parseInt(numberedLinks[0].textContent.trim());
        var paramRx  = /([?&])(pg|page|p|pagenumber|pagenum)=(\d+)/i;
        var paramMatch = refUrl.match(paramRx);

        // Fallback: return the individual link hrefs we can see
        if (!paramMatch) {
            var fallback = numberedLinks.map(function (a) { return a.href; });
            if (lastLink) fallback.push(lastLink.href);
            return Array.from(new Set(fallback));
        }

        var paramName = paramMatch[2];
        var baseUrl   = refUrl.replace(new RegExp('[?&]' + paramName + '=\\d+', 'i'), '');
        var connector = baseUrl.indexOf('?') !== -1 ? '&' : '?';

        // Total pages: prefer "Last" link, else highest visible number
        var totalPages = Math.max.apply(null, numberedLinks.map(function (a) { return parseInt(a.textContent.trim()); }));
        if (lastLink) {
            var lm = lastLink.href.match(new RegExp('[?&]' + paramName + '=(\\d+)', 'i'));
            if (lm) totalPages = parseInt(lm[1]);
        }

        var urls = [];
        for (var p = 2; p <= totalPages; p++) {
            urls.push(baseUrl + connector + paramName + '=' + p);
        }
        return urls;
    }

    // ── Fetch a page and return its parsed docs ───────────────────────────────

    function fetchPageDocs(url) {
        return fetch(url, { credentials: 'include' })
            .then(function (r) { return r.text(); })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var tbl = findDocTable(doc);
                return tbl ? parseDocs(tbl) : [];
            })
            .catch(function () { return []; });
    }

    // ── Build overlay ─────────────────────────────────────────────────────────

    function buildOverlay(caseInfo, initialDocs) {
        var allDocs  = initialDocs.slice();
        var current  = allDocs.slice();
        var sortDir  = {};

        var caseTitle = caseInfo.caption || caseInfo.indexNo || 'NYSCEF Case';

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
        titleEl.style.cssText = 'flex:1;overflow:hidden;';
        titleEl.innerHTML = '<div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(caseTitle) + '</div>' +
            (caseInfo.indexNo ? '<div style="font-size:11px;opacity:0.75;margin-top:1px;">Index No. ' + esc(caseInfo.indexNo) + '</div>' : '');

        var btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;gap:6px;flex-shrink:0;';

        var copyBtn  = makeBtn('Copy for Email', '#2d6a9f');
        var closeBtn = makeBtn('✕', 'transparent');
        closeBtn.style.border = '1px solid rgba(255,255,255,0.35)';
        closeBtn.onclick = function () { overlay.remove(); };

        btnWrap.appendChild(copyBtn);
        btnWrap.appendChild(closeBtn);
        hdr.appendChild(titleEl);
        hdr.appendChild(btnWrap);
        overlay.appendChild(hdr);

        // Status bar
        var sub = document.createElement('div');
        sub.style.cssText = 'padding:6px 14px;background:#eef2f7;color:#555;font-size:11.5px;border-bottom:1px solid #ddd;flex-shrink:0;';
        sub.textContent = allDocs.length + ' documents';
        overlay.appendChild(sub);

        // Table
        var wrap = document.createElement('div');
        wrap.style.cssText = 'overflow:auto;flex:1;';
        var tbl = document.createElement('table');
        tbl.style.cssText = 'width:100%;border-collapse:collapse;';

        var thead = document.createElement('thead');
        var hrow  = document.createElement('tr');
        ['#', 'Document', 'Filed By', 'Date Filed', 'Status'].forEach(function (col, ci) {
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

        function renderRows() {
            tbody.innerHTML = '';
            current.forEach(function (d, idx) {
                var tr = document.createElement('tr');
                tr.style.background = idx % 2 === 0 ? '#fff' : '#f8fafc';

                appendCell(tr, d.num, 'width:28px;text-align:center;color:#666;');

                var td2 = document.createElement('td');
                td2.style.cssText = 'padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;';
                td2.innerHTML = '<span style="font-weight:500">' + esc(d.docName) + '</span>' +
                    (d.subtitle ? '<br><span style="color:#666;font-size:11px;font-style:italic">' + esc(d.subtitle) + '</span>' : '');
                tr.appendChild(td2);

                appendCell(tr, d.filedBy, '');
                appendCell(tr, d.filedDate, 'white-space:nowrap;');

                var td5 = document.createElement('td');
                td5.style.cssText = 'padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap;';
                var processed = d.status.toLowerCase().indexOf('process') !== -1;
                td5.innerHTML = '<span style="' + (processed ? 'color:#2a7a2a;font-weight:600;' : '') + '">' + esc(d.status) + '</span>';
                tr.appendChild(td5);

                tbody.appendChild(tr);
            });
        }

        function appendCell(tr, text, extra) {
            var td = document.createElement('td');
            td.style.cssText = 'padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top;' + extra;
            td.textContent = text;
            tr.appendChild(td);
        }

        function sortBy(ci) {
            var keys = ['num', 'docName', 'filedBy', 'filedDate', 'status'];
            var asc = !sortDir[ci];
            sortDir = {};
            sortDir[ci] = asc;
            current.sort(function (a, b) {
                var av = ci === 0 ? parseInt(a[keys[ci]]) || 0 : (a[keys[ci]] || '');
                var bv = ci === 0 ? parseInt(b[keys[ci]]) || 0 : (b[keys[ci]] || '');
                return av < bv ? (asc ? -1 : 1) : av > bv ? (asc ? 1 : -1) : 0;
            });
            renderRows();
        }

        renderRows();

        // Copy as formatted HTML for Outlook / Word
        copyBtn.onclick = function () {
            var thStyle = 'padding:6px 10px;border:1px solid #999;text-align:left;background:#1a3a5c;color:#fff;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
            var tdStyle = 'padding:5px 10px;border:1px solid #ccc;vertical-align:top;font-family:Calibri,Arial,sans-serif;font-size:11pt;';
            var tdAlt   = tdStyle + 'background:#f2f5f9;';

            var html = '<p style="font-family:Calibri,Arial,sans-serif;font-size:12pt;font-weight:bold;margin-bottom:2px;">' + esc(caseTitle) + '</p>' +
                (caseInfo.indexNo ? '<p style="font-family:Calibri,Arial,sans-serif;font-size:10pt;color:#555;margin-bottom:8px;">Index No. ' + esc(caseInfo.indexNo) + '</p>' : '');
            html += '<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;"><thead><tr>';
            ['#', 'Document', 'Filed By', 'Date Filed', 'Status'].forEach(function (c) {
                html += '<th style="' + thStyle + '">' + esc(c) + '</th>';
            });
            html += '</tr></thead><tbody>';
            allDocs.forEach(function (d, i) {
                var td = i % 2 === 0 ? tdStyle : tdAlt;
                var docCell = '<span style="font-weight:bold;">' + esc(d.docName) + '</span>' +
                    (d.subtitle ? '<br><span style="font-style:italic;color:#555;">' + esc(d.subtitle) + '</span>' : '');
                var statusCell = d.status.toLowerCase().indexOf('process') !== -1
                    ? '<span style="color:#1a7a1a;font-weight:bold;">' + esc(d.status) + '</span>'
                    : esc(d.status);
                html += '<tr>';
                html += '<td style="' + td + 'text-align:center;">' + esc(d.num) + '</td>';
                html += '<td style="' + td + '">' + docCell + '</td>';
                html += '<td style="' + td + '">' + esc(d.filedBy) + '</td>';
                html += '<td style="' + td + 'white-space:nowrap;">' + esc(d.filedDate) + '</td>';
                html += '<td style="' + td + '">' + statusCell + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';

            navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })]).then(function () {
                copyBtn.textContent = 'Copied!';
                setTimeout(function () { copyBtn.textContent = 'Copy for Email'; }, 2000);
            });
        };

        // Exposed so the main flow can add pages as they arrive
        return {
            el: overlay,
            addDocs: function (moreDocs) {
                allDocs = allDocs.concat(moreDocs);
                current = allDocs.slice();
                sortDir = {};
                renderRows();
            },
            setStatus: function (msg) { sub.textContent = msg; }
        };
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
        alert('NYSCEF Scraper: Found the document table but could not read any rows.\nThe page structure may have changed.');
        return;
    }

    var caseInfo = getCaseInfo();
    var ui = buildOverlay(caseInfo, docs);
    document.body.appendChild(ui.el);

    // Fetch remaining pages (if any)
    var extraUrls = getExtraPageUrls();
    console.log('[NYSCEF Scraper] Extra page URLs:', extraUrls);
    if (extraUrls.length > 0) {
        var totalPages = extraUrls.length + 1;
        ui.setStatus('Page 1 of ' + totalPages + ' loaded — fetching remaining pages…');

        var chain = Promise.resolve();
        var loaded = 1;
        extraUrls.forEach(function (url) {
            chain = chain.then(function () {
                return fetchPageDocs(url).then(function (moreDocs) {
                    loaded++;
                    ui.addDocs(moreDocs);
                    if (loaded < totalPages) {
                        ui.setStatus('Loaded ' + loaded + ' of ' + totalPages + ' pages…');
                    } else {
                        var total = loaded; // capture for closure
                        ui.setStatus('All ' + total + ' pages loaded');
                        setTimeout(function () {
                            ui.setStatus(ui.el.querySelectorAll('tbody tr').length + ' documents (all pages)');
                        }, 1500);
                    }
                });
            });
        });
    } else {
        ui.setStatus(docs.length + ' document' + (docs.length !== 1 ? 's' : ''));
    }

})();
