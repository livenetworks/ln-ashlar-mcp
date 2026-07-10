import { createHash, timingSafeEqual } from 'crypto';

export const secureCompare = (a, b) => {
	const ha = createHash('sha256').update(String(a ?? '')).digest();
	const hb = createHash('sha256').update(String(b ?? '')).digest();
	return timingSafeEqual(ha, hb);
};
