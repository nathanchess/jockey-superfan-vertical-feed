import requests
import os
from dotenv import load_dotenv
import time
from pathlib import Path
from twelvelabs import TasksRetrieveResponse, TwelveLabs

LOCAL_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(LOCAL_ENV_PATH)
HEADERS = {
    "x-api-key": os.getenv("TL_API_KEY"),
    "Content-Type": "application/json"
}
BASE_URL = "https://api.twelvelabs.io/v1.3"

TWELVELABS_CLIENT = TwelveLabs(api_key=os.getenv("TL_API_KEY"))

SUPERFAN_CTV_ENRICHMENT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "type": "object",
        "properties": {
            "primary_scene_category": {
                "type": "string",
                "description": "Dominant moment type for specific scene for vertical-feed taxonomy and profile matching",
            },
            "subtags": {
                "type": "array",
                "description": (
                    "Concrete visual/audio signals of scene for what is happening and can be heard in the scene"
                ),
                "items": {"type": "string"},
                "maxItems": 5,
            },
            "description": {
                "type": "string",
                "description": (
                    "Precise moment summary: who, what happened, tone, body language, "
                    "and dialogue subtext for long-form episodic TV. Should pinpoint exact names and map to people."
                ),
            },
            "emotional_intensity": {
                "type": "string",
                "description": "Salience for feed ranking and profile intensity preference",
                "enum": ["low", "medium", "high", "explosive"],
            },
            "key_figures": {
                "type": "array",
                "description": "On-screen people or named participants; pairs or groups in conflict/alliance when clear. Get specific names and map to people.",
                "items": {"type": "string"},
            },
            "feed_headline": {
                "type": "string",
                "description": "One short headline suitable for a vertical clip card",
            },
            "scene_setting": {
                "type": "string",
                "description": (
                    "Setting type: interview, ensemble_conversation, event, travel, "
                    "home, workplace, competition_stage, other"
                ),
            },
            "cross_episode_significance": {
                "type": "string",
                "description": (
                    "If inferable: recurring storyline, callback, finale/reunion relevance, "
                    "or franchise-defining beat; empty string if none"
                ),
            },
        },
        "required": [
            "primary_scene_category",
            "subtags",
            "description",
            "emotional_intensity",
            "key_figures",
            "feed_headline",
        ]
    }
}

def fetch_knowledge_store_id() -> str:

    if not LOCAL_ENV_PATH.exists():
        raise FileNotFoundError(f"Local environment file not found at {LOCAL_ENV_PATH}")

    with open(LOCAL_ENV_PATH, "r") as f:
        for line in f.readlines():
            if line.startswith("TL_KS_ID="):
                return line.split("=")[1].strip()
        return None

def create_and_save_knowledge_store(name: str, enrichment_config: dict | str) -> str:

    if fetch_knowledge_store_id() is not None:
        raise ValueError("Knowledge store already exists")

    response = requests.post(
        f"{BASE_URL}/knowledge-stores",
        headers=HEADERS,
        json={
            "name": name,
            "ingestion_config": {
                "enrichment_config": enrichment_config
            }
        }
    )

    ks_id = response.json()["_id"]

    new_lines = []
    lines = LOCAL_ENV_PATH.read_text(encoding='utf-8').splitlines()

    for line in lines:
        if line.startswith("TL_KS_ID="):
            new_lines.append(f"TL_KS_ID={ks_id}")
        else:
            new_lines.append(line)

    LOCAL_ENV_PATH.write_text("\n".join(new_lines), encoding='utf-8')

    return ks_id

def add_asset_to_knowledge_store(asset_ids: list[str]):
    
    if fetch_knowledge_store_id() is None:
        raise ValueError("Knowledge store does not exist")

    ks_id = fetch_knowledge_store_id()

    for asset_id in asset_ids:
        response = requests.post(
            f"{BASE_URL}/knowledge-stores/{ks_id}/items",
            headers=HEADERS,
            json={"asset_id": asset_id}
        )

        item_id = response.json()["_id"]

        print(f"Added asset {asset_id} to knowledge store {ks_id} with item id {item_id}")

        while True:
            status = requests.get(
                f"{BASE_URL}/knowledge-stores/{ks_id}/items/{item_id}",
                headers=HEADERS
            ).json()["status"]
            if status == "ready":
                print(f"Asset {asset_id} ready!")
                break
            elif status == "failed":
                raise ValueError(f"Failed to add asset {asset_id} to knowledge store {ks_id}")
            print(f"Waiting for asset {asset_id} to be ready...")
            time.sleep(5)

        

def main():

    # content_knowledge_store_id = create_and_save_knowledge_store(
    #    name="content-knowledge-store",
    #     enrichment_config=SUPERFAN_CTV_ENRICHMENT_JSON_SCHEMA
    # )

    add_asset_to_knowledge_store(
        asset_ids=["6a14ddbaddce351fa0ae8952", "6a14ddba163adca316ecc289",  "6a14ddba853a852798e911d5", "6a14ddba15649e226a0448c8", "6a14ddbbbe7b2161f2b604f0"]
    )

if __name__ == "__main__":
    main()