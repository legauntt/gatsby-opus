<script>
	let daTroof = $state(false);

	const heh = () => {
		const wup = new Audio('/dvdp/06_someday.m4a');
		wup.play();
		daTroof = true;
	};
</script>

<div class="p-5">
	<div class="text-2xl">Apinkslip</div>

	<div class="my-5">
		<button class="border border-solid border-black bg-violet-400 p-2" onclick={heh}>
			Yehrye
		</button>
	</div>

	{#if daTroof}
		<div>Abzolutely</div>
	{/if}
</div>

<style scoped>
</style>
