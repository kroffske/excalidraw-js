# Frozen asset-search benchmark v1

`benchmark.json` is copied byte-for-byte from the accepted T-119 retrieval
contract. Its SHA-256 is
`c721577bdffc3062ac4f120409d1fbfabb4cb3374e37e56081aa182f76c01fd6`.

The 48 queries are evenly split across English/Russian and core/trading. Passing
this fixture supports discovery only for these accepted intents against the two
current bundled packs. It is not a general semantic-search, weak-model, or
visual-quality benchmark.
