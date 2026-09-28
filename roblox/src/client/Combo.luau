-- Chains jump-overs made within WINDOW seconds of each other into a points multiplier (src/combo.ts).

local WINDOW = 2.5
local MAX = 5

local Combo = {}
Combo.__index = Combo

function Combo.new()
	return setmetatable({ count = 0, timer = 0 }, Combo)
end

-- Registers a jump-over and returns the multiplier to apply to it.
function Combo:hit(): number
	self.count = if self.timer > 0 then math.min(MAX, self.count + 1) else 1
	self.timer = WINDOW
	return self.count
end

function Combo:update(dt: number)
	self.timer = math.max(0, self.timer - dt)
	if self.timer == 0 then
		self.count = 0
	end
end

function Combo:reset()
	self.count = 0
	self.timer = 0
end

return Combo
