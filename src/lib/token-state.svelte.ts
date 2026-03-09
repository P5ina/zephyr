// Shared reactive token state for syncing between layout (top bar) and pages
let tokens = $state(0);
let bonusTokens = $state(0);
let guestGenerationsUsed = $state(0);

export const tokenState = {
	get tokens() {
		return tokens;
	},
	set tokens(v: number) {
		tokens = v;
	},
	get bonusTokens() {
		return bonusTokens;
	},
	set bonusTokens(v: number) {
		bonusTokens = v;
	},
	get guestGenerationsUsed() {
		return guestGenerationsUsed;
	},
	set guestGenerationsUsed(v: number) {
		guestGenerationsUsed = v;
	},
	get total() {
		return tokens + bonusTokens;
	},
	init(t: number, bt: number, ggu: number) {
		tokens = t;
		bonusTokens = bt;
		guestGenerationsUsed = ggu;
	},
};
