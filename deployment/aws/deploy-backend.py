"""Update ECS images from immutable Git SHA tags. Run after image publication."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path


def aws(*args):
    result = subprocess.run(["aws", *args, "--output", "json"], check=True, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="agentverse")
    parser.add_argument("--region", default="ap-southeast-2")
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    account = aws("sts", "get-caller-identity")["Account"]
    registry = f"{account}.dkr.ecr.{args.region}.amazonaws.com"
    for service in ["auth", "chat", "agent", "billing", "gateway"]:
        info = aws("ecs", "describe-services", "--cluster", args.project, "--services", service, "--region", args.region)
        if info.get("failures") or not info.get("services"):
            raise RuntimeError(f"Create the infrastructure first: missing ECS service {service}")
        deployed = info["services"][0]
        if deployed["desiredCount"] == 0:
            raise RuntimeError("Complete first-deployment setup and start services before enabling automatic deployment")
        task = aws("ecs", "describe-task-definition", "--task-definition", deployed["taskDefinition"], "--region", args.region)["taskDefinition"]
        old_task = task["taskDefinitionArn"]
        for key in ["taskDefinitionArn", "revision", "status", "requiresAttributes", "compatibilities", "registeredAt", "registeredBy", "deregisteredAt"]:
            task.pop(key, None)
        for container in task["containerDefinitions"]:
            if container["name"] == service:
                container["image"] = f"{registry}/{args.project}-{service}:{args.tag}"
        with tempfile.TemporaryDirectory() as directory:
            filename = Path(directory) / "task.json"
            filename.write_text(json.dumps(task), encoding="utf-8")
            revision = aws("ecs", "register-task-definition", "--cli-input-json", f"file://{filename}", "--region", args.region)["taskDefinition"]["taskDefinitionArn"]
        aws("ecs", "update-service", "--cluster", args.project, "--service", service, "--task-definition", revision, "--region", args.region)
        # Waiter output is empty on success. Detect a circuit-breaker rollback rather than calling it success.
        aws("ecs", "wait", "services-stable", "--cluster", args.project, "--services", service, "--region", args.region)
        current = aws("ecs", "describe-services", "--cluster", args.project, "--services", service, "--region", args.region)["services"][0]
        if current["taskDefinition"] != revision:
            raise RuntimeError(f"{service} rolled back to {old_task}; inspect CloudWatch and ECS events")
        print(f"Healthy deployment: {service}")


if __name__ == "__main__":
    main()
