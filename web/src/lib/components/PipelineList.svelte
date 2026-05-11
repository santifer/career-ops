<script lang="ts">
	import type { OfferDTO } from '$lib/types';
	import { activeId, activeState } from '$lib/stores';
	import { scoreCls } from '$lib/utils/score';

	interface Props {
		offers: OfferDTO[];
	}
	let { offers }: Props = $props();

	// Filter by active state tab
	const filtered = $derived(() => {
		const state = $activeState;
		if (state === 'all') return offers;
		if (state === 'top') return offers.filter(o => o.score >= 4.0);
		return offers.filter(o => o.state === state);
	});

	// Group by state
	const groups = $derived(() => {
		const map = new Map<string, OfferDTO[]>();
		filtered().forEach(o => {
			if (!map.has(o.state)) map.set(o.state, []);
			map.get(o.state)!.push(o);
		});
		return [...map.entries()];
	});
</script>

<div class="list">
	{#each groups() as [state, items]}
		<div class="group-header">
			<span>{state} ({items.length})</span>
			<span class="rule"></span>
		</div>
		{#each items as o}
			<div
				class="row {$activeId === o.n ? 'active' : ''}"
				onclick={() => activeId.set(o.n)}
				role="button"
				tabindex="0"
				onkeydown={e => e.key === 'Enter' && activeId.set(o.n)}
			>
				<span class="num mono">#{o.n}</span>
				<span class="score {scoreCls(o.score)}">{o.score.toFixed(1)}</span>
				<span class="date">{o.date}</span>
				<span class="co"><b>{o.company}</b></span>
				<span class="title">{o.title}</span>
				<span class="state">
					<span class="status-pill {o.state}">{o.state}</span>
				</span>
			</div>
		{/each}
	{/each}
	{#if filtered().length === 0}
		<div style="padding:40px 24px;color:var(--fg-3);font-family:var(--mono);font-size:12px;">
			No postings in this state.
		</div>
	{/if}
</div>
