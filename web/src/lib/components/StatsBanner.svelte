<script lang="ts">
	import type { OfferDTO, MetaDTO } from '$lib/types';

	interface Props { offers: OfferDTO[]; meta: MetaDTO | null; }
	let { offers, meta }: Props = $props();

	const total     = $derived(() => offers.length);
	const top4      = $derived(() => offers.filter(o => o.score >= 4).length);
	const awaiting  = $derived(() => offers.filter(o => o.state === 'evaluated').length);

	const nEval    = $derived(() => offers.filter(o => o.state === 'evaluated').length);
	const nApplied = $derived(() => offers.filter(o => o.state === 'applied' || o.state === 'interview' || o.state === 'responded').length);
	const nSkipped = $derived(() => offers.filter(o => o.state === 'skip').length);

	// conic-gradient degrees: evaluated occupies most, then applied, then skipped
	const pieGradient = $derived(() => {
		const t = total() || 1;
		const evalDeg    = (nEval()    / t) * 360;
		const appliedDeg = (nApplied() / t) * 360;
		const e = evalDeg.toFixed(1);
		const a = (evalDeg + appliedDeg).toFixed(1);
		return `conic-gradient(var(--gold) 0 ${e}deg, var(--green) ${e}deg ${a}deg, var(--slate) ${a}deg 360deg)`;
	});
</script>

<div class="statgrid">
	<!-- Pipeline -->
	<div class="statcard">
		<div class="lbl">🏒 Pipeline</div>
		<div class="val">{total()}<span class="unit">postings</span></div>
	</div>

	<!-- Status Mix donut -->
	<div class="statcard pie">
		<div class="lbl">🥌 Status mix</div>
		<div class="pie-row">
			<div class="pie-donut" style="background:{pieGradient()}" role="img" aria-label="Status pie"></div>
			<div class="pie-legend">
				<div class="li"><span class="sw" style="background:var(--gold)"></span>Evaluated <b>{nEval()}</b></div>
				<div class="li"><span class="sw" style="background:var(--green)"></span>Applied <b>{nApplied()}</b></div>
				<div class="li"><span class="sw" style="background:var(--slate)"></span>Skipped <b>{nSkipped()}</b></div>
			</div>
		</div>
	</div>

	<!-- Top ≥ 4 -->
	<div class="statcard">
		<div class="lbl">🦫 Top ≥ 4</div>
		<div class="val">{top4()}</div>
	</div>

	<!-- Awaiting action -->
	<div class="statcard">
		<div class="lbl">⛸️ Awaiting action</div>
		<div class="val">{awaiting()}</div>
	</div>
</div>
