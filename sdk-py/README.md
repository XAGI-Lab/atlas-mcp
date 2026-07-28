# ATLAS MCP Python SDK

Async Python client for the six-tool ATLAS MCP task interface.

```python
from atlas_mcp import AtlasClient

async with AtlasClient(workspace="/path/to/project") as atlas:
    capabilities = await atlas.capabilities()
```
