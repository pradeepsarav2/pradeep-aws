import os
import json
import math
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3
from botocore.config import Config

# ------------------------------------------------------------------
# Configure your ECS services here.
# Keys = Friendly names used in Slack report.
# Required fields per service:
#   cluster: ECS Cluster name
#   service: ECS Service name
#   region: AWS region
# Optional (for ALB RequestCount metrics):
#   load_balancer: ALB ARN suffix as shown in CloudWatch metrics dimension (e.g. app/my-alb/123abc456def7890)
#   target_group: Target Group ARN suffix (e.g. targetgroup/my-tg/6d0ecf831eec9f09)
# ------------------------------------------------------------------
SERVICE_MAP = {
    "FE Next.js (eu-west-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-FE-service",
        "region": "eu-west-1",  
        "load_balancer": "app/waltzai-prod-alb/475dea38d14c0d4f",  
        "target_group": "targetgroup/waltzai-prod-frontend-tg/3b3a205e08df54bc"    
    },
    "BE FastAPI (us-east-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-FastAPI-service",
        "region": "us-east-1",
        "load_balancer": "app/waltzai-prod-alb/a2166cae04619688",
        "target_group": "targetgroup/waltzai-prod-fastapi-tg/79f30e16df4c6f71"
    },
    "BE FastAPI (eu-west-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-FastAPI-service",
        "region": "eu-west-1",
        "load_balancer": "app/waltzai-prod-alb/475dea38d14c0d4f",
        "target_group": "targetgroup/waltzai-prod-fastapi-tg/a8f053b5f0796928"
    },
    "BE Matomo (us-east-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-matomo-service",
        "region": "us-east-1",
        "load_balancer": "app/waltzai-prod-alb/a2166cae04619688",
        "target_group": "targetgroup/waltzai-prod-matomo-tg/56febbdace8d76e6"
    },
    "BE Matomo (eu-west-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-matomo-service",
        "region": "eu-west-1",
        "load_balancer": "app/waltzai-prod-alb/475dea38d14c0d4f",
        "target_group": "targetgroup/waltzai-prod-matomo-tg/5e89f0ff0e09e9cf"
    },
    #calcom
    "Calcom API (us-east-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltz-ai-prod-calcom-api-service",
        "region": "us-east-1",
        "load_balancer": "app/waltzai-prod-alb/a2166cae04619688",
        "target_group": "targetgroup/waltzai-prod-calcom-api-tg/9a2f0f763557617f"
    },
    "Calcom API (eu-west-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltz-ai-prod-calcom-api-service",
        "region": "eu-west-1",
        "load_balancer": "app/waltzai-prod-alb/475dea38d14c0d4f",
        "target_group": "targetgroup/waltzai-prod-calcom-api-tg/1ac6d6a3af849657"
    },
    #prophet
    "Prophet API (us-east-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-prophetapi-service",
        "region": "us-east-1",
        "load_balancer": "app/waltzai-prod-alb/a2166cae04619688",
        "target_group": "targetgroup/waltzai-prod-prophetapi-tg/88736d637f72d667"
    },
    "Prophet API (eu-west-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-prophetapi-service",
        "region": "eu-west-1",
        "load_balancer": "app/waltzai-prod-alb/475dea38d14c0d4f",
        "target_group": "targetgroup/waltzai-prod-prophetapi-tg/bf4f34e81122f680"
    },
    #yourls
    "Yourls (us-east-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-Yourls-service",
        "region": "us-east-1",
        "load_balancer": "app/waltzai-prod-alb/a2166cae04619688",
        "target_group": "targetgroup/waltzai-prod-yourls-tg/a83950d3bd6d54e4"
    },
    "Yourls (eu-west-1)": {
        "cluster": "waltz-ai-prod-cluster",
        "service": "waltzai-prod-Yourls-service",
        "region": "eu-west-1",
        "load_balancer": "app/waltzai-prod-alb/475dea38d14c0d4f",
        "target_group": "targetgroup/waltzai-prod-yourls-tg/b30c768341acb00f"
    },
}

# Environment variables:
# SLACK_WEBHOOK_URL (required for Slack post)
# HOURS_OFFSET (optional, integer hour offset from UTC for display; e.g. 5.5 not supported -> use IST_LABEL)
# IST_LABEL (optional label to show e.g. 'IST')
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")

_clients = {}

def cw(region: str):
    if region not in _clients:
        _clients[region] = boto3.client("cloudwatch", region_name=region, config=Config(retries={"max_attempts": 5, "mode": "standard"}))
    return _clients[region]

def utc_now():
    return datetime.now(timezone.utc)

def previous_day_range(end_utc: datetime):
    """
    Returns start,end covering the last 24h (end exclusive).
    Example: end=now, start=end-24h
    """
    end = end_utc.replace(microsecond=0, second=0)  # align to minute
    start = end - timedelta(hours=24)
    return start, end

def get_ecs_metric(cluster: str, service: str, metric_name: str, region: str):
    """
    Fetches Average & Maximum statistics for the past 24h for an ECS service.
    Metrics: CPUUtilization, MemoryUtilization (Namespace: AWS/ECS)
    """
    end = utc_now()
    start, end = previous_day_range(end)

    resp = cw(region).get_metric_statistics(
        Namespace="AWS/ECS",
        MetricName=metric_name,
        Dimensions=[
            {"Name": "ClusterName", "Value": cluster},
            {"Name": "ServiceName", "Value": service},
        ],
        StartTime=start,
        EndTime=end,
        Period=300,  # 5 minutes
        Statistics=["Average", "Maximum"],
        Unit="Percent"
    )

    datapoints = resp.get("Datapoints", [])
    if not datapoints:
        return None

    # Overall average of per-period averages; max of maximums
    avg_values = [dp["Average"] for dp in datapoints if "Average" in dp]
    max_values = [dp["Maximum"] for dp in datapoints if "Maximum" in dp]

    overall_avg = sum(avg_values) / len(avg_values) if avg_values else None
    overall_max = max(max_values) if max_values else None

    return {
        "average": round(overall_avg, 2) if overall_avg is not None else None,
        "max": round(overall_max, 2) if overall_max is not None else None
    }

def get_alb_request_count(load_balancer: str, target_group: str, region: str):
    """Return total request count for last 24h for the given ALB target group.
    Dimensions values must match exactly what CloudWatch shows (ARN suffix forms).
    """
    end = utc_now()
    start, end = previous_day_range(end)
    resp = cw(region).get_metric_statistics(
        Namespace="AWS/ApplicationELB",
        MetricName="RequestCount",
        Dimensions=[
            {"Name": "LoadBalancer", "Value": load_balancer},
            {"Name": "TargetGroup", "Value": target_group},
        ],
        StartTime=start,
        EndTime=end,
        Period=300,
        Statistics=["Sum"],
        Unit="Count"
    )
    dps = resp.get("Datapoints", [])
    if not dps:
        return None
    total = sum(dp.get("Sum", 0) for dp in dps)
    return {"total": int(total)}

def format_number(v):
    if v is None:
        return "-"
    # Keep two decimals but trim trailing zeros
    s = f"{v:.2f}"
    s = s.rstrip("0").rstrip(".")
    return s

def collect_service_metrics():
    results = []
    for name, cfg in SERVICE_MAP.items():
        cluster = cfg["cluster"]
        service = cfg["service"]
        region = cfg.get("region") or os.getenv("DEFAULT_REGION") or boto3.session.Session().region_name or "us-east-1"

        cpu = get_ecs_metric(cluster, service, "CPUUtilization", region)
        mem = get_ecs_metric(cluster, service, "MemoryUtilization", region)

        requests = None
        lb = cfg.get("load_balancer")
        tg = cfg.get("target_group")
        if lb and tg:
            try:
                requests = get_alb_request_count(lb, tg, region)
            except Exception as e:
                requests = {"error": str(e)}

        results.append({
            "name": name,
            "cluster": cluster,
            "service": service,
            "region": region,
            "cpu": cpu,
            "mem": mem,
            "requests": requests,
        })
    return results

def build_slack_text(metrics):
    now_utc = utc_now()
    start, end = previous_day_range(now_utc)
    header = f"📊 Daily System Metrics (UTC {end.strftime('%Y-%m-%d %H:%M')}) - Past 24 Hrs \n "
    lines = []
    for m in metrics:
        cpu_avg = format_number(m["cpu"]["average"]) if m["cpu"] else "-"
        cpu_max = format_number(m["cpu"]["max"]) if m["cpu"] else "-"
        mem_avg = format_number(m["mem"]["average"]) if m["mem"] else "-"
        mem_max = format_number(m["mem"]["max"]) if m["mem"] else "-"
        req_line = ""
        if m.get("requests"):
            if "error" in m["requests"]:
                req_line = f"\n  • Req  → error: {m['requests']['error']}"
            else:
                total = m['requests']['total']
                req_line = f"\n  • Req  → total: {total}"
        line = (
            f"*{m['name']}*\n"
            f"  • CPU  → avg: {cpu_avg}% | max: {cpu_max}%\n"
            f"  • Mem  → avg: {mem_avg}% | max: {mem_max}%" + req_line
        )
        lines.append(line)
    if not lines:
        lines.append("_No data returned from CloudWatch_")
    return header + "\n".join(lines)

def build_slack_blocks(metrics):
    now_utc = utc_now()
    start, end = previous_day_range(now_utc)
    header_text = f"📊 *Daily System Metrics* (UTC {end.strftime('%Y-%m-%d %H:%M')}) – Past 24 Hrs"

    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": "📊 Daily ECS Metrics", "emoji": True}
        },
        {"type": "section", "text": {"type": "mrkdwn", "text": header_text}},
        {"type": "divider"}
    ]

    for m in metrics:
        cpu_avg = format_number(m["cpu"]["average"]) if m["cpu"] else "-"
        cpu_max = format_number(m["cpu"]["max"]) if m["cpu"] else "-"
        mem_avg = format_number(m["mem"]["average"]) if m["mem"] else "-"
        mem_max = format_number(m["mem"]["max"]) if m["mem"] else "-"

        req_val = "-"
        if m.get("requests"):
            if "error" in m["requests"]:
                req_val = f"error: {m['requests']['error']}"
            else:
                req_val = str(m["requests"]["total"])

        blocks.append({
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Service:*\n{m['name']}"},
                {"type": "mrkdwn", "text": f"*Region:*\n{m['region']}"},
                {"type": "mrkdwn", "text": f"*CPU Avg:*\n{cpu_avg}%"},
                {"type": "mrkdwn", "text": f"*CPU Max:*\n{cpu_max}%"},
                {"type": "mrkdwn", "text": f"*Mem Avg:*\n{mem_avg}%"},
                {"type": "mrkdwn", "text": f"*Mem Max:*\n{mem_max}%"},
                {"type": "mrkdwn", "text": f"*Requests:*\n{req_val}"}
            ]
        })
        blocks.append({"type": "divider"})

    if not metrics:
        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": "_No data returned from CloudWatch_"}
        })

    return blocks


def post_to_slack(blocks):
    if not SLACK_WEBHOOK_URL:
        return {"posted": False, "reason": "SLACK_WEBHOOK_URL not set"}
    payload = {"blocks": blocks}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        SLACK_WEBHOOK_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"posted": True, "status": resp.status}
    except Exception as e:
        return {"posted": False, "error": str(e)}
    
def build_slack_table(metrics):
    now_utc = utc_now()
    start, end = previous_day_range(now_utc)
    header = f"📊 *Daily System Metrics* (UTC {end.strftime('%Y-%m-%d %H:%M')}) - Past 24 Hrs"

    def add_pct(v):
        return v + "%" if v != "-" else v

    lines = []
    lines.append("```")
    lines.append(f"{'Service':30} {'CPU Avg':>8} {'CPU Max':>8} {'Mem Avg':>8} {'Mem Max':>8} {'Requests':>10}")
    lines.append("-" * 80)

    for m in metrics:
        cpu_avg = format_number(m["cpu"]["average"]) if m["cpu"] else "-"
        cpu_max = format_number(m["cpu"]["max"]) if m["cpu"] else "-"
        mem_avg = format_number(m["mem"]["average"]) if m["mem"] else "-"
        mem_max = format_number(m["mem"]["max"]) if m["mem"] else "-"
        requests = "-"
        if m.get("requests"):
            if "error" in m["requests"]:
                requests = "ERR"
            else:
                requests = str(m["requests"]["total"])

        line = (
            f"{m['name'][:30]:30} "
            f"{add_pct(cpu_avg):>8} {add_pct(cpu_max):>8} "
            f"{add_pct(mem_avg):>8} {add_pct(mem_max):>8} "
            f"{requests:>10}"
        )
        lines.append(line)

    lines.append("```")

    return header + "\n" + "\n".join(lines)

def post_to_slack_table(metrics):
    if not SLACK_WEBHOOK_URL:
        return {"posted": False, "reason": "SLACK_WEBHOOK_URL not set"}
    text = build_slack_table(metrics)
    payload = {"text": text}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        SLACK_WEBHOOK_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"posted": True, "status": resp.status}
    except Exception as e:
        return {"posted": False, "error": str(e)}


# def post_to_slack(text: str):
#     if not SLACK_WEBHOOK_URL:
#         return {"posted": False, "reason": "SLACK_WEBHOOK_URL not set"}
#     payload = {"text": text}
#     data = json.dumps(payload).encode("utf-8")
#     req = urllib.request.Request(
#         SLACK_WEBHOOK_URL,
#         data=data,
#         headers={"Content-Type": "application/json"},
#         method="POST"
#     )
#     try:
#         with urllib.request.urlopen(req, timeout=10) as resp:
#             return {"posted": True, "status": resp.status}
#     except Exception as e:
#         return {"posted": False, "error": str(e)}

def lambda_handler(event, context):
    metrics = collect_service_metrics()
    table_text = build_slack_table(metrics)
    print("Generated Slack text:\n", table_text)
    # Pass metrics (list) to posting function, not the already-rendered text
    slack_result = post_to_slack_table(metrics)

    body = {
        "message": "ECS daily metrics generated",
        "slack": slack_result,
        "services": metrics
    }

    return {
        "statusCode": 200,
        "body": json.dumps(body, default=str)
    }