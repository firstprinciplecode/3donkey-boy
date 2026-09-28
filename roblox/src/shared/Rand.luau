-- Deterministic random numbers, bit-for-bit the same as seededRandom and hashString in the web build,
-- so props and windows land in the same places on both.

local TWO32 = 2 ^ 32

local Rand = {}

-- Low 32 bits of a * b, like Math.imul (as unsigned).
local function imul(a: number, b: number): number
	a %= TWO32
	b %= TWO32
	local lo = b % 65536
	local hi = (b - lo) / 65536
	return (a * lo + ((a * hi) % 65536) * 65536) % TWO32
end

-- FNV-1a over the string's bytes.
function Rand.hashString(s: string): number
	local h = 2166136261
	for i = 1, #s do
		h = imul(bit32.bxor(h, string.byte(s, i)), 16777619)
	end
	return h
end

-- mulberry32: returns a function giving numbers in [0, 1).
function Rand.seeded(seed: number): () -> number
	local s = seed % TWO32
	return function()
		s = (s + 0x6d2b79f5) % TWO32
		local t = imul(bit32.bxor(s, bit32.rshift(s, 15)), bit32.bor(1, s))
		t = bit32.bxor((t + imul(bit32.bxor(t, bit32.rshift(t, 7)), bit32.bor(61, t))) % TWO32, t)
		return bit32.bxor(t, bit32.rshift(t, 14)) / TWO32
	end
end

return Rand
