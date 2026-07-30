# MELRA Python SDK

Async Python client for MELRA task, evidence, and durable workflow interfaces.

```python
from melra import MelraClient

async with MelraClient(workspace="/path/to/project") as melra:
    capabilities = await melra.capabilities()
```
