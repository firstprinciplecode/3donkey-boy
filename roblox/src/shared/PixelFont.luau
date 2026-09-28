-- 4x5 block glyphs for the chunky letters, rows top to bottom (src/pixelFont.ts).

local PixelFont = {}

PixelFont.W, PixelFont.H = 4, 5

local GLYPHS = {
	["1"] = { ".##.", "###.", ".##.", ".##.", "####" },
	U = { "#..#", "#..#", "#..#", "#..#", "####" },
	P = { "###.", "#..#", "###.", "#...", "#..." },
	D = { "###.", "#..#", "#..#", "#..#", "###." },
	O = { ".##.", "#..#", "#..#", "#..#", ".##." },
}

-- Filled cells as { column from the left, row from the bottom }, both 0-based.
function PixelFont.cells(ch: string): { { number } }
	local cells = {}
	for r, row in GLYPHS[ch] or {} do
		for col = 1, #row do
			if string.sub(row, col, col) == "#" then
				table.insert(cells, { col - 1, PixelFont.H - r })
			end
		end
	end
	return cells
end

return PixelFont
