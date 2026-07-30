# MELRA Python SDK

Async Python client for the six-tool MELRA task interface.

```python
from melra import MelraClient

async with MelraClient(workspace="/path/to/project") as melra:
    capabilities = await melra.capabilities()
```
