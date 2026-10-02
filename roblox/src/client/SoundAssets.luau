-- Uploaded audio, as "rbxassetid://<id>". Leave an entry blank to keep that part silent.
-- Upload roblox/audio/*.wav (render them with npm run roblox:audio) via Studio's Asset Manager.
-- Each level skin has its own loop, plus the octave-up copy that plays while the hammer is held.
-- A blank theme falls back to Meadow, so a level is never stuck without music.
return {
	sfx = "rbxassetid://77388323240562", -- popscotch-sfx.wav
	themes = {
		meadow = {
			music = "rbxassetid://105645985210478", -- popscotch-music-meadow.wav
			hammer = "rbxassetid://123038760694547", -- popscotch-music-meadow-hammer.wav
		},
		candy = {
			music = "rbxassetid://102440306744107", -- popscotch-music-candy.wav
			hammer = "rbxassetid://72161436303059", -- popscotch-music-candy-hammer.wav
		},
		desert = {
			music = "rbxassetid://78843576974501", -- popscotch-music-desert.wav
			hammer = "rbxassetid://77101970199970", -- popscotch-music-desert-hammer.wav
		},
		autumn = {
			music = "rbxassetid://84476409814234", -- popscotch-music-autumn.wav
			hammer = "rbxassetid://81077980598391", -- popscotch-music-autumn-hammer.wav
		},
		winter = {
			music = "rbxassetid://103929541433345", -- popscotch-music-winter.wav
			hammer = "rbxassetid://95470191932069", -- popscotch-music-winter-hammer.wav
		},
		tomb = {
			music = "rbxassetid://85296937162789", -- popscotch-music-tomb.wav
			hammer = "rbxassetid://83119709049380", -- popscotch-music-tomb-hammer.wav
		},
		volcano = {
			music = "rbxassetid://132911028558250", -- popscotch-music-volcano.wav
			hammer = "rbxassetid://118237673061384", -- popscotch-music-volcano-hammer.wav
		},
	},
}
