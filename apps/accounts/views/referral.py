from django.utils import timezone
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import feature_flags
from apps.accounts.models import ReferralCode, ReferralNotice, ReferralParticipation, ReferralReward
from apps.accounts.serializers.referral import ReferralNoticeReadSerializer
from apps.accounts.services import referral_campaign


class ReferralCampaignAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        config = referral_campaign.FIRST_REFERRAL_CAMPAIGN
        enabled = feature_flags.exam_preparation_referral_enabled()
        eligible = referral_campaign.has_historical_exam_preparation_access(user=request.user)
        code = ReferralCode.objects.filter(
            user=request.user, campaign_tag=config.campaign_tag,
        ).select_related("promotion_code").first() if eligible else None
        if eligible and enabled and code is None:
            code = referral_campaign.ensure_referral_code(user=request.user, campaign_tag=config.campaign_tag)

        effective_count = ReferralParticipation.objects.filter(
            campaign_tag=config.campaign_tag,
            referral_code__campaign_tag=config.campaign_tag,
            referral_code__user=request.user,
            status=ReferralParticipation.Status.QUALIFIED,
        ).count()
        rewards = ReferralReward.objects.filter(
            referrer=request.user, campaign_tag=config.campaign_tag,
            kind__in=(ReferralReward.Kind.SCIENCE_3, ReferralReward.Kind.VLOG_5),
        ).order_by("kind", "-generation", "-pk")
        reward_states = {}
        for kind in (ReferralReward.Kind.SCIENCE_3, ReferralReward.Kind.VLOG_5):
            reward = next((item for item in rewards if item.kind == kind), None)
            reward_states[kind] = (
                {"status": "earned" if reward.status in (ReferralReward.Status.GRANTED,
                                                            ReferralReward.Status.NON_REVERSIBLE)
                 else reward.status, "generation": reward.generation}
                if reward else {"status": "not_earned"}
            )
        notices = ReferralNotice.objects.filter(
            user=request.user, campaign_tag=config.campaign_tag,
        ).order_by("-created_at", "-pk")
        return Response({
            "enabled": enabled,
            "eligible": eligible,
            "locked": not eligible,
            "campaign": {"tag": config.campaign_tag, "name": config.campaign_name},
            "code": code.promotion_code.code if code else None,
            "effective_count": effective_count,
            "nodes": [
                {"number": number, "completed": effective_count >= number,
                 "milestone": number in (3, 5)}
                for number in range(1, 6)
            ],
            "milestones": {"science_3": reward_states[ReferralReward.Kind.SCIENCE_3],
                           "vlog_5": reward_states[ReferralReward.Kind.VLOG_5]},
            "history": ReferralNoticeReadSerializer(notices, many=True).data,
        })


class ReferralNoticeUnreadAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notices = ReferralNotice.objects.filter(
            user=request.user,
            campaign_tag=referral_campaign.FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            is_global_notice=True,
            acknowledged_at__isnull=True,
        ).order_by("-created_at", "-pk")
        return Response(ReferralNoticeReadSerializer(notices, many=True).data)


class ReferralNoticeAcknowledgeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notice_id):
        from django.http import Http404
        with transaction.atomic():
            notice = ReferralNotice.objects.select_for_update().filter(
                pk=notice_id,
                user=request.user,
                campaign_tag=referral_campaign.FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                is_global_notice=True,
            ).first()
            if notice is None:
                raise Http404
            if notice.acknowledged_at is None:
                notice.acknowledged_at = timezone.now()
                notice.save(update_fields=("acknowledged_at",))
        return Response({"id": notice.pk, "acknowledged_at": notice.acknowledged_at})
