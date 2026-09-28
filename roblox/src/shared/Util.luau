local Util = {}

local TAU = math.pi * 2

-- Frame-rate independent exponential smoothing.
function Util.damp(current: number, target: number, lambda: number, dt: number): number
	return current + (target - current) * (1 - math.exp(-lambda * dt))
end

function Util.dampAngle(current: number, target: number, lambda: number, dt: number): number
	local delta = (target - current + math.pi) % TAU - math.pi
	return current + delta * (1 - math.exp(-lambda * dt))
end

function Util.easeInOutCubic(t: number): number
	if t < 0.5 then
		return 4 * t * t * t
	end
	return 1 - (-2 * t + 2) ^ 3 / 2
end

return Util
