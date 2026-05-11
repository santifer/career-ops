<script lang="ts">
	import type { OfferDTO } from '$lib/types';
	import { scoreCls } from '$lib/utils/score';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { updateOfferState, fetchOffer } from '$lib/api';
	import { offers, view, evalSize, pipeSize } from '$lib/stores';

	interface Props { offer: OfferDTO | null; }
	let { offer }: Props = $props();

	let reportMD = $state<string | null>(null);
	let loadingReport = $state(false);

	$effect(() => {
		if (!offer) { reportMD = null; return; }
		if (offer.report_md) { reportMD = offer.report_md; return; }
		loadingReport = true;
		fetchOffer(offer.n).then(full => {
			reportMD = full.report_md ?? null;
			loadingReport = false;
		}).catch(() => { loadingReport = false; });
	});

	const rendered = $derived(() => reportMD ? renderMarkdown(reportMD) : '');

	function legitimacyCls(l: string) {
		if (l?.toLowerCase().includes('high')) return 'ok';
		if (l?.toLowerCase().includes('low'))  return 'bad';
		return 'warn';
	}

	async function changeState(newState: string) {
		if (!offer) return;
		const updated = await updateOfferState(offer.n, newState);
		offers.update(list => list.map(o => o.n === updated.n ? { ...o, state: updated.state } : o));
	}

	function toggleExpand() {
		evalSize.update(s => {
			const next = s === 'expanded' ? 'normal' : 'expanded';
			if (next === 'expanded') pipeSize.set('normal');
			return next;
		});
	}
	function minimise() {
		evalSize.set('min');
		pipeSize.set('normal');
	}
</script>

<div class="panel panel-eval" style="flex:1;display:flex;flex-direction:column">
	<!-- Minimised strip -->
	<button class="panel-strip" onclick={() => evalSize.set('normal')} title="Restore evaluation">
		<span class="ico">◀</span>
		<span class="v-label">Evaluation{offer ? ` · #${offer.n} ${offer.company}` : ''}</span>
	</button>

	{#if !offer}
		<div class="panel-header">
			<span class="title">Evaluation</span>
			<div class="right">
				<button class="icon-btn {$view === 'report' ? 'primary' : ''}" onclick={() => view.set('report')} title="Report view">✎</button>
				<button class="icon-btn {$view === 'files'  ? 'primary' : ''}" onclick={() => view.set('files')}  title="Files view">⟦⟧</button>
				<button class="icon-btn" onclick={toggleExpand} title="Expand to 2/3">{$evalSize === 'expanded' ? '⤡' : '⤢'}</button>
				<button class="icon-btn" onclick={minimise} title="Minimise">▶</button>
			</div>
		</div>
		<div style="padding:40px 24px;color:var(--fg-3);font-family:var(--mono);font-size:12px">
			↑↓ select a posting from the pipeline.
		</div>
	{:else}
		<div class="panel-header">
			<span style="color:var(--red-2)">#{offer.n}</span>
			<span class="title">{offer.company} — {offer.title}</span>
			<span class="score {scoreCls(offer.score)}" style="margin-left:8px">{offer.score.toFixed(1)}</span>
			<div class="right">
				<span class="status-pill {offer.state}">{offer.state}</span>
				{#if offer.url}
					<a href={offer.url} target="_blank" rel="noopener" class="icon-btn" title="Open posting">↗</a>
				{/if}
				<button class="icon-btn {$view === 'report' ? 'primary' : ''}" onclick={() => view.set('report')} title="Report view">✎</button>
				<button class="icon-btn {$view === 'files'  ? 'primary' : ''}" onclick={() => view.set('files')}  title="Files view">⟦⟧</button>
				<button class="icon-btn" title={offer.state === 'applied' ? 'Undo applied' : 'Mark applied'}
					onclick={() => changeState(offer.state === 'applied' ? 'evaluated' : 'applied')}>✓</button>
				<button class="icon-btn" title="Skip" onclick={() => changeState('skip')}>⦸</button>
				<button class="icon-btn" onclick={toggleExpand} title="Expand to 2/3">{$evalSize === 'expanded' ? '⤡' : '⤢'}</button>
				<button class="icon-btn" onclick={minimise} title="Minimise">▶</button>
			</div>
		</div>

		<div class="chiprow" style="padding:10px 14px;border-bottom:1px solid var(--line);background:var(--bg-1)">
			{#if offer.archetype}<span class="chip mono">{offer.archetype}</span>{/if}
			{#if offer.loc}<span class="chip mono">{offer.loc}</span>{/if}
			{#if offer.comp}<span class="chip mono">{offer.comp}</span>{/if}
			{#if offer.legitimacy}
				<span class="chip mono {legitimacyCls(offer.legitimacy)}">
					{offer.legitimacy.toLowerCase().includes('high') ? '●' : '◐'} {offer.legitimacy}
				</span>
			{/if}
		</div>

		{#if loadingReport}
			<div style="padding:40px 24px;color:var(--fg-3);font-family:var(--mono);font-size:12px">Loading report…</div>
		{:else if rendered()}
			<div class="report">{@html rendered()}</div>
		{:else if offer.notes}
			<div class="report" style="padding:28px 36px">
				<p style="color:var(--fg-2)">{offer.notes}</p>
				{#if !offer.report}
					<p style="color:var(--fg-3);font-size:12px;margin-top:20px">No report file found.</p>
				{/if}
			</div>
		{:else}
			<div style="padding:40px 24px;color:var(--fg-3);font-family:var(--mono);font-size:12px">No report available.</div>
		{/if}
	{/if}
</div>
