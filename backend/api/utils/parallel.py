from concurrent.futures import ThreadPoolExecutor, wait


def run_parallel_with_timeout(task_factories, timeout, defaults=None, max_workers=None):
    """
    Exécute des tâches en parallèle avec un timeout global.
    Les tâches non terminées à temps sont ignorées sans bloquer la fermeture.
    """
    if not task_factories:
        return {}

    defaults = defaults or {}
    executor = ThreadPoolExecutor(max_workers=max_workers or max(1, len(task_factories)))
    futures = {executor.submit(factory): key for key, factory in task_factories.items()}
    results = {key: defaults.get(key) for key in task_factories}

    try:
        done, not_done = wait(futures.keys(), timeout=timeout)

        for future in done:
            key = futures[future]
            try:
                results[key] = future.result()
            except Exception:
                results[key] = defaults.get(key)

        for future in not_done:
            future.cancel()

        return results
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
