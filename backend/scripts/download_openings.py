import os
import urllib.request


def download_tsvs(target_dir=None):
    if not target_dir:
        base_dir = os.path.dirname(os.path.dirname(__file__))
        target_dir = os.getenv("OPENINGS_DATA_DIR") or os.path.join(base_dir, "openings_data")

    os.makedirs(target_dir, exist_ok=True)
    base_url = "https://raw.githubusercontent.com/lichess-org/chess-openings/master/{}.tsv"

    for letter in ["a", "b", "c", "d", "e"]:
        url = base_url.format(letter)
        target_path = os.path.join(target_dir, f"{letter}.tsv")
        print(f"Downloading {url} to {target_path}...")
        try:
            urllib.request.urlretrieve(url, target_path)
            print(f"Downloaded {letter}.tsv successfully ({os.path.getsize(target_path)} bytes).")
        except Exception as e:
            print(f"Failed to download {url}: {e}")

    # Also sync to backend/data/openings if it exists or is default
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "openings")
    if data_dir != target_dir:
        os.makedirs(data_dir, exist_ok=True)
        for letter in ["a", "b", "c", "d", "e"]:
            src = os.path.join(target_dir, f"{letter}.tsv")
            dst = os.path.join(data_dir, f"{letter}.tsv")
            if os.path.exists(src):
                import shutil
                shutil.copy2(src, dst)


if __name__ == "__main__":
    download_tsvs()
