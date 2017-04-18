document.addEventListener('DOMContentLoaded', (event) => {
    let textarea = document.getElementById('textarea');
    let context = {
        uuid: undefined,
        lines: [],
        tab: 2,
        header: {},
        config: {}, // Can be loaded remotely
    };
    const headerRe = /^\/\/\*\* (.*) \*\*$/;
    const lineRe = /(\s*)?(.*)(\s*)?/;
    const paramRe = /([a-z_]+)=(.+)/;
    const setupToolbar = (id, type, key, def, cb) => {
        let el = document.getElementById(id);
        if (!el) return;
        let value = localStorage.getItem(key) || def;
        el.addEventListener('change', (evt) => {
            let val = evt.target.value;
            if (type == 'checkbox') val = evt.target.checked;
            if (type == 'number') val = evt.target.valueAsNumber;
            if (val !== value) {
                // Changed
                if (cb) cb(val, false);
                localStorage.setItem(key, val);
            }
            value = val;
        });
        if (type == 'checkbox') {
            value = {'true': true, 'false': false}[value] || false;
            el.checked = value;
        }
        if (type == 'number') el.value = value;
        if (type == 'text') el.value = value || '';
        if (value !== def && cb) cb(value, true);
    };
    setupToolbar('tool_theme', 'checkbox', 'dark', false, (val) => {
        document.body.className = val? 'dark': 'light';
    });
    setupToolbar('tool_tab', 'number', 'tab', 2, (val, init) => {
        if (context.uuid) { // Re-tab
            readText(textarea.value || '', false);
            context.tab = val;
            putData([-1, -1]);
        } else
            context.tab = val; // Only change
    });
    setupToolbar('tool_config', 'text', 'config_url', undefined, (val) => {
    });
    const notifyReady = () => {
        if(window.parent && window.parent !== window) {
            window.parent.postMessage({status: 'ready'}, '*');
        }
    };
    const readText = (text, header) => {
        // Split text into line, with optional header
        const lines = text.split('\n');
        let start = 0;
        /* XXX Disable it for now
        context.header = {};
        if (header) {
            const m = headerRe.exec(lines[0]);
            if (m) { // Parse
                start = 1; // Skip
                const parts = m[1].split(';');
                for (var i = 0; i < parts.length; i++) { // Parse args
                    var mp = paramRe.exec(parts[i]);
                    if (mp) context.header[mp[1]] = mp[2];
                };
                // console.log('Parse:', context);
                if (parseInt(context.header.tab) >= 1) { // Correct
                    context.tab = parseInt(context.header.tab);
                };
            };
        };
        */
        context.lines = [];
        for (var i = start; i < lines.length; i++) { // Parse lines
            const m = lineRe.exec(lines[i]);
            const last = i == lines.length - 1;
            let item = {
                text: m[2] || '',
                indent: Math.floor((m[1] || '').length / context.tab),
            };
            context.lines.push(item);
        };
    };
    const makeText = (header) => {
        let result = '';
        /* XXX Disable it for now
        if (header) { // Render header
            context.header.tab = context.tab;
            let parts = [];
            for (var key in context.header) {
                parts.push(key+'='+context.header[key]);
            };
            result += '//** '+parts.join(';')+' **\n';
        };
        */
        context.lines.forEach((line, idx) => {
            for (var i = 0; i < line.indent*context.tab; i++) { // Add spaces
                result += ' ';
            };
            result += line.text + '\n';
        });
        return result.replace(/\n+$/, '')+'\n';
    };
    const cursor2Pos = (cursor) => {
        let pos = 0;
        let row = cursor[0];
        if (row == -1) { // Last line
            row = context.lines.length;
        };
        let col = cursor[1];
        for (var i = 0; i < context.lines.length; i++) { // Collect size
            var line = context.lines[i];
            if (i < row) { // top
                pos += line.indent * context.tab + line.text.length + 1;
            };
            if (i == row) { // This line
                if (col == -1) { // Last char
                    return line.indent * context.tab + line.text.length;
                };
                return pos + col;
            };
        };
        return pos;
    };
    const loadData = (uuid, text) => {
        context.uuid = uuid;
        readText(text, true);
        putData([-1, -1]);
        textarea.focus();
    };
    const putData = (start, finish) => {
        const text = makeText(false);
        textarea.value = text;
        if (start) { // Put cursor
            const posStart = cursor2Pos(start);
            const posFinish = finish? cursor2Pos(finish): posStart;
            // console.log('putData:', posStart);
            textarea.selectionStart = posStart;
            textarea.selectionEnd = posFinish;
        };
    };
    const sendData = () => {
        readText(textarea.value || '', false);
        const text = makeText(true); // With header
        if (window.parent !== window) {
            window.parent.postMessage({text: text, id: context.uuid}, '*');
        };
    };
    const findCursor = (finish) => {
        let pos = finish? textarea.selectionEnd: textarea.selectionStart;
        let left = textarea.value.substr(0, pos);
        let row = left.split('\n').length - 1;
        let col = row == 0? pos: pos - left.lastIndexOf('\n') - 1;
        return [row, col];
    };
    textarea.addEventListener('input', (evt) => {
        // Changed in editor
        sendData();
    });
    textarea.addEventListener('keyup', (evt) => {
        if (evt.which === 13) { // Enter - indent
            let start = findCursor();
            readText(textarea.value || '', false);
            if (start[0] > 0 && context.lines.length>start[0]) { 
                // Add indent from prev line
                context.lines[start[0]].indent += context.lines[start[0]-1].indent;
                start[1] += context.tab * context.lines[start[0]-1].indent;
                putData(start);
                sendData();
            };
        };
    });
    textarea.addEventListener('keydown', (evt) => {
        if (evt.which === 9) { // Tab
            const back = evt.shiftKey;
            evt.preventDefault();
            let start = findCursor();
            let finish = findCursor(true);
            readText(textarea.value || '', false);
            for (var i = start[0]; i <= finish[0]; i++) { // Indent
                if (back && context.lines[i].indent == 0) { // No indent
                    continue;
                };
                const mul = back? -1: 1;
                context.lines[i].indent += 1 * mul;
                if (i == start[0]) { // Move cursor
                    start[1] += context.tab * mul;
                }
                if (i == finish[0]) { // Move cursor
                    finish[1] += context.tab * mul;
                };
            };
            // console.log('Tab:', evt, start, finish);
            putData(start, finish);
            sendData();
        };
    });
    window.addEventListener('message', (event) => {
        loadData(event.data.id, event.data.text || '');
    });
    notifyReady();
});
