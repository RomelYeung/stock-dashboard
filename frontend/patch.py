import re

with open('src/components/AIFinancialAdviserChat.jsx', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    'import { motion, AnimatePresence } from "framer-motion";',
    'import { motion, AnimatePresence, useDragControls } from "framer-motion";'
)

# 2. Hooks
content = content.replace(
    'const scrollRef = useRef(null);',
    'const scrollRef = useRef(null);\n  const dragControls = useDragControls();\n  const abortControllerRef = useRef(null);'
)

# 3. useEffect 1
old_effect_1 = """  useEffect(() => {
    if (showSessions && ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/sessions`)
        .then(r => r.json())
        .then(d => { if (d.success) setSessionsList(d.data); })
        .catch(console.error);
    }
  }, [showSessions, ticker]);"""

new_effect_1 = """  useEffect(() => {
    let isMounted = true;
    if (showSessions && ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/sessions`)
        .then(r => r.json())
        .then(d => { if (d.success && isMounted) setSessionsList(d.data); })
        .catch(console.error);
    }
    return () => { isMounted = false; };
  }, [showSessions, ticker]);"""

content = content.replace(old_effect_1, new_effect_1)

# 4. useEffect 2
old_effect_2 = """  useEffect(() => {
    if (ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/session?sessionId=${sessionId || ''}`)
        .then(r => r.json())
        .then(data => {
           if (data.success && data.data) {
             if (data.data.history && data.data.history.length > 0) {
               setMessages(data.data.history);
               setDebateActive(true);
             } else {
               setMessages([]);
               setDebateActive(false);
             }
             if (data.data.sessionId) {
               setSessionId(data.data.sessionId);
             }
           }
        })
        .catch(e => console.error(e));
    }
  }, [ticker, sessionId]);"""

new_effect_2 = """  useEffect(() => {
    let isMounted = true;
    if (ticker) {
      fetch(`/api/stocks/${ticker}/advisor-chat/session?sessionId=${sessionId || ''}`)
        .then(r => r.json())
        .then(data => {
           if (!isMounted) return;
           if (data.success && data.data) {
             if (data.data.history && data.data.history.length > 0) {
               setMessages(data.data.history);
               setDebateActive(true);
             } else {
               setMessages([]);
               setDebateActive(false);
             }
             if (data.data.sessionId) {
               setSessionId(data.data.sessionId);
             }
           }
        })
        .catch(e => console.error(e));
    }
    return () => { isMounted = false; };
  }, [ticker, sessionId]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);"""

content = content.replace(old_effect_2, new_effect_2)

# 5. sendMessage
old_send_1 = """    setCurrentAgent("Coordinator");

    try {
      const res = await fetch(`/api/stocks/${ticker}/advisor-chat`, {"""

new_send_1 = """    setCurrentAgent("Coordinator");

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(`/api/stocks/${ticker}/advisor-chat`, {"""

content = content.replace(old_send_1, new_send_1)

old_send_2 = """        body: JSON.stringify({ message: text, sessionId })
      });"""

new_send_2 = """        body: JSON.stringify({ message: text, sessionId }),
        signal: abortControllerRef.current.signal
      });"""

content = content.replace(old_send_2, new_send_2)

old_send_3 = """    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "model", agent: "System", text: "Error connecting to advisor." }]);
    } finally {"""

new_send_3 = """    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        console.error(err);
        setMessages(prev => [...prev, { role: "model", agent: "System", text: "Error connecting to advisor." }]);
      }
    } finally {"""

content = content.replace(old_send_3, new_send_3)

# 6. JSX motion.div
old_jsx_1 = """            transition={{ duration: 0.2 }}
            drag
            dragMomentum={false}"""

new_jsx_1 = """            transition={{ duration: 0.2 }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}"""

content = content.replace(old_jsx_1, new_jsx_1)

old_jsx_2 = """          >
            <div className="drag-handle" style={windowHeader}>"""

new_jsx_2 = """          >
            <div className="drag-handle" style={windowHeader} onPointerDown={(e) => dragControls.start(e)}>"""

content = content.replace(old_jsx_2, new_jsx_2)

with open('src/components/AIFinancialAdviserChat.jsx', 'w') as f:
    f.write(content)

print("Patch applied successfully.")
