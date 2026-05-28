python -c "
import re, sys
with open('electron-ui/ipc/handlers.cjs', 'r', encoding='utf-8') as f:
    c = f.read()
old = r'''    return await store.add({
      id,
      email,
      agentType,
      authBlob: null,
      profileName,
      cooldownUntil: null,
      lastUsed: null,
      status: 'active'
    });
  });
  // Backwards-compatible alias'''
new = '''    const added = await store.add({
      id,
      email,
      agentType,
      authBlob: null,
      profileName,
      cooldownUntil: null,
      lastUsed: null,
      status: 'active'
    });
    return JSON.parse(JSON.stringify(added));
  });
  // Backwards-compatible alias'''
c2 = c.replace(old, new)
if c2 == c:
    print('ERROR: pattern not found')
else:
    with open('electron-ui/ipc/handlers.cjs', 'w', encoding='utf-8') as f:
        f.write(c2)
    print('Fixed')
"